import * as vscode from "vscode";

// ── Token type & modifier legends ──────────────────────────────────
const tokenTypes = [
    "namespace", "class", "enum", "interface", "typeParameter",
    "parameter", "variable", "property", "enumMember", "function",
    "method", "decorator", "keyword", "comment", "string", "number",
    "operator",
];
const tokenModifiers = [
    "declaration", "readonly", "static", "defaultLibrary",
    "selfParameter", "async", "definition",
];

export const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

// ── Built-in names ─────────────────────────────────────────────────
const BUILTIN_FUNCTIONS = new Set([
    "abs","all","any","ascii","bin","bool","breakpoint","bytearray","bytes",
    "callable","chr","classmethod","compile","complex","delattr","dict","dir",
    "divmod","enumerate","eval","exec","filter","float","format","frozenset",
    "getattr","globals","hasattr","hash","help","hex","id","input","int",
    "isinstance","issubclass","iter","len","list","locals","map","max",
    "memoryview","min","next","object","oct","open","ord","pow","print",
    "property","range","repr","reversed","round","set","setattr","slice",
    "sorted","staticmethod","str","sum","super","tuple","type","vars","zip",
]);
const BUILTIN_TYPES = new Set([
    "int","float","str","bool","bytes","list","dict","set","tuple",
    "frozenset","object","type","range","complex","bytearray","memoryview",
    "None","True","False","Ellipsis","NotImplemented",
]);
const TYPING_NAMES = new Set([
    "Any","Union","Optional","List","Dict","Set","Tuple","Type","Callable",
    "Iterator","Generator","Sequence","Mapping","MutableMapping",
    "ClassVar","Final","Literal","TypeVar","TypeAlias","Protocol",
    "NamedTuple","TypedDict","Annotated","TypeGuard","Self",
    "Concatenate","ParamSpec","Unpack","Never","NoReturn","SupportsInt",
    "SupportsFloat","SupportsComplex","SupportsBytes","SupportsAbs",
    "SupportsRound","Awaitable","Coroutine","AsyncIterator",
    "AsyncGenerator","Iterable","MutableSequence","MutableSet",
    "IO","TextIO","BinaryIO","Pattern","Match","overload","override",
    "final","dataclass_transform","reveal_type",
]);

// ── Regex patterns ─────────────────────────────────────────────────
const RE_CLASS_DEF     = /^(\s*)class\s+([A-Za-z_]\w*)/;
const RE_FUNC_DEF      = /^(\s*)(async\s+)?def\s+([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?\s*\(([^)]*)\)/;
const RE_DECORATOR     = /^(\s*)@([A-Za-z_][\w.]*)/;
const RE_IMPORT_FROM   = /^(\s*)from\s+([\w.]+)\s+import\s+(.+)$/;
const RE_IMPORT        = /^(\s*)import\s+(.+)$/;
const RE_ASSIGN        = /^(\s*)([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*=(?!=)/;
const RE_ANN_ONLY      = /^(\s*)([A-Za-z_]\w*)\s*:\s*(.+)$/;
const RE_FOR           = /^(\s*)(?:async\s+)?for\s+(.+?)\s+in\s+/;
const RE_EXCEPT        = /^(\s*)except\s+.*\bas\s+([A-Za-z_]\w*)/;
const RE_RETURN_ARROW  = /->\s*([A-Za-z_][\w\[\], |.]*)\s*:/;
const RE_IDENTIFIER    = /[A-Za-z_]\w*/g;
const RE_ALL_CAPS      = /^[A-Z][A-Z0-9_]+$/;
const RE_LAMBDA        = /\blambda\s+([^:]+):/g;
const RE_COMPREHENSION = /\b(?:for)\s+([^in]+)\s+in\s+/g;
const RE_MAGIC_METHOD  = /^__[a-z_]+__$/;
// Single-line string detection (multi-line handled separately)
const RE_STRING        = /(?:r|b|u|rb|br|f)?["'](?:\\.|[^"'\\])*["']|(?:r|b|u|rb|br|f)?"""[\s\S]*?"""|(?:r|b|u|rb|br|f)?'''[\s\S]*?'''/gi;

// ── Scope tracker ──────────────────────────────────────────────────
interface Scope {
    indent: number;
    kind: "class" | "function";
}

// ── Provider ───────────────────────────────────────────────────────
export class PythonSemanticTokensProvider
    implements vscode.DocumentSemanticTokensProvider
{
    provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.SemanticTokens {
        const enabled = vscode.workspace
            .getConfiguration("lightPyrefly")
            .get<boolean>("enabled", true);
        const builder = new vscode.SemanticTokensBuilder(legend);
        if (!enabled) return builder.build();

        const scopes: Scope[] = [];
        const importedNames = new Map<string, string>(); // name → tokenType
        const definedNames  = new Map<string, string>(); // name → tokenType

        // Pre-pass: detect multi-line strings across the entire document
        const multiLineStringRanges = this.detectMultiLineStrings(document);

        // Pass 1: collect definitions & imports so pass-2 can colour usages
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            this.collectDefinitions(line, i, scopes, importedNames, definedNames);
        }

        // Reset scopes for pass 2
        scopes.length = 0;

        const allTokens: { line: number, char: number, length: number, type: number, mod: number }[] = [];
        const fakeBuilder = {
            push: (lineIdx: number, char: number, length: number, type: number, mod: number) => {
                allTokens.push({ line: lineIdx, char, length, type, mod });
            }
        };

        // Pass 2: emit tokens
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            this.tokenizeLine(line, i, fakeBuilder as any, scopes, importedNames, definedNames, multiLineStringRanges);
        }

        // Sort tokens to avoid out-of-order pushing errors
        allTokens.sort((a, b) => {
            if (a.line !== b.line) return a.line - b.line;
            return a.char - b.char;
        });

        let lastLine = -1;
        let lastChar = -1;
        for (const t of allTokens) {
            if (t.line !== lastLine) {
                lastLine = t.line;
                lastChar = -1;
            }
            if (t.char >= lastChar) {
                builder.push(t.line, t.char, t.length, t.type, t.mod);
                lastChar = t.char + t.length;
            }
        }

        return builder.build();
    }

    // ── Detect multi-line strings across the document ─────────────
    private detectMultiLineStrings(document: vscode.TextDocument): Map<number, [number, number][]> {
        const ranges = new Map<number, [number, number][]>(); // lineIdx → [(start, end), ...]
        let inTripleString = false;
        let tripleQuote = '';
        let stringStartLine = -1;
        let stringStartChar = -1;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            
            if (!ranges.has(i)) {
                ranges.set(i, []);
            }

            let j = 0;
            while (j < line.length) {
                if (!inTripleString) {
                    // Check for triple quote start
                    if (j + 2 < line.length) {
                        const triple = line.substring(j, j + 3);
                        if (triple === '"""' || triple === "'''") {
                            // Check for string prefix (r, f, b, etc.)
                            let prefixStart = j - 1;
                            while (prefixStart >= 0 && /[rfbRFBuU]/.test(line[prefixStart])) {
                                prefixStart--;
                            }
                            prefixStart++;

                            inTripleString = true;
                            tripleQuote = triple;
                            stringStartLine = i;
                            stringStartChar = prefixStart;
                            j += 3;
                            continue;
                        }
                    }
                    j++;
                } else {
                    // Look for triple quote end
                    if (j + 2 < line.length && line.substring(j, j + 3) === tripleQuote) {
                        // Mark all lines from start to end
                        if (stringStartLine === i) {
                            // Single line triple-quoted string
                            ranges.get(i)!.push([stringStartChar, j + 2]);
                        } else {
                            // Multi-line: mark start line from stringStartChar to end
                            ranges.get(stringStartLine)!.push([stringStartChar, line.length]);
                            // Mark middle lines entirely
                            for (let k = stringStartLine + 1; k < i; k++) {
                                ranges.get(k)!.push([0, document.lineAt(k).text.length]);
                            }
                            // Mark end line from 0 to j+2
                            ranges.get(i)!.push([0, j + 2]);
                        }
                        inTripleString = false;
                        j += 3;
                        continue;
                    }
                    j++;
                }
            }

            // If still in string at end of line, mark rest of line
            if (inTripleString && stringStartLine === i) {
                ranges.get(i)!.push([stringStartChar, line.length]);
            } else if (inTripleString && stringStartLine < i) {
                ranges.get(i)!.push([0, line.length]);
            }
        }

        return ranges;
    }

    // ── Pass 1: collect names ──────────────────────────────────────
    private collectDefinitions(
        line: string, _lineIdx: number, scopes: Scope[],
        importedNames: Map<string, string>, definedNames: Map<string, string>
    ) {
        const indent = line.search(/\S/);
        if (indent < 0) return;
        while (scopes.length && indent <= scopes[scopes.length - 1].indent) scopes.pop();

        let m: RegExpMatchArray | null;

        if ((m = line.match(RE_CLASS_DEF))) {
            definedNames.set(m[2], "class");
            scopes.push({ indent, kind: "class" });
        } else if ((m = line.match(RE_FUNC_DEF))) {
            const inClass = scopes.length > 0 && scopes[scopes.length - 1].kind === "class";
            definedNames.set(m[3], inClass ? "method" : "function");
            scopes.push({ indent, kind: "function" });
        } else if ((m = line.match(RE_IMPORT_FROM))) {
            const names = m[3].split(",");
            for (const n of names) {
                const parts = n.trim().split(/\s+as\s+/);
                const local = (parts[1] || parts[0]).trim();
                if (local === "*") continue;
                if (BUILTIN_TYPES.has(local) || TYPING_NAMES.has(local)) {
                    importedNames.set(local, "class");
                } else {
                    let type = "namespace";
                    if (RE_ALL_CAPS.test(local)) type = "constant";
                    else if (/^[A-Z]/.test(local)) type = "class";
                    else type = "function";
                    importedNames.set(local, type);
                }
            }
        } else if ((m = line.match(RE_IMPORT))) {
            const names = m[2].split(",");
            for (const n of names) {
                const parts = n.trim().split(/\s+as\s+/);
                const local = (parts[1] || parts[0]).trim().split(".")[0];
                importedNames.set(local, "namespace");
            }
        } else if ((m = line.match(RE_ASSIGN))) {
            const name = m[2];
            if (!definedNames.has(name)) {
                definedNames.set(name, RE_ALL_CAPS.test(name) ? "constant" : "variable");
            }
        }
    }

    // ── Pass 2: emit tokens ────────────────────────────────────────
    private tokenizeLine(
        line: string, lineIdx: number, builder: vscode.SemanticTokensBuilder,
        scopes: Scope[], importedNames: Map<string, string>,
        definedNames: Map<string, string>,
        multiLineStringRanges: Map<number, [number, number][]>
    ) {
        const indent = line.search(/\S/);
        if (indent < 0) return;
        while (scopes.length && indent <= scopes[scopes.length - 1].indent) scopes.pop();
        const inClass = scopes.length > 0 && scopes[scopes.length - 1].kind === "class";

        let m: RegExpMatchArray | null;

        // ── Decorators ─────────────────────────────────────────────
        if ((m = line.match(RE_DECORATOR))) {
            builder.push(lineIdx, m[1].length, 1 + m[2].length, idx("decorator"), 0);
        }

        // ── Class definition ───────────────────────────────────────
        if ((m = line.match(RE_CLASS_DEF))) {
            const nameStart = line.indexOf(m[2], m[1].length + 5);
            builder.push(lineIdx, nameStart, m[2].length, idx("class"), mod("declaration"));
            scopes.push({ indent, kind: "class" });
            // Base classes after the name
            this.highlightTypeRefs(line, lineIdx, nameStart + m[2].length, builder, importedNames, definedNames);
        }

        // ── Function/method definition ─────────────────────────────
        if ((m = line.match(RE_FUNC_DEF))) {
            const asyncPart = m[2] || "";
            const funcName = m[3];
            const typeParamsStr = m[4];
            const paramsStr = m[5];
            const tokenType = inClass ? "method" : "function";
            const nameStart = line.indexOf(funcName, m[1].length + asyncPart.length + 3);
            const modBits = mod("declaration") | (asyncPart ? mod("async") : 0);
            builder.push(lineIdx, nameStart, funcName.length, idx(tokenType), modBits);
            scopes.push({ indent, kind: "function" });

            // Type parameters [T, U, ...]
            if (typeParamsStr) {
                const tpStart = line.indexOf("[", nameStart) + 1;
                for (const tp of typeParamsStr.split(",")) {
                    const name = tp.trim();
                    if (!name) continue;
                    const tpOff = line.indexOf(name, tpStart);
                    if (tpOff >= 0) {
                        builder.push(lineIdx, tpOff, name.length, idx("typeParameter"), 0);
                    }
                }
            }

            // Parameters
            this.highlightParams(paramsStr, line, lineIdx, builder, importedNames, definedNames);

            // Return type annotation
            const arrowMatch = line.match(RE_RETURN_ARROW);
            if (arrowMatch) {
                const arrowIdx = line.lastIndexOf("->");
                this.highlightTypeRefs(line, lineIdx, arrowIdx + 2, builder, importedNames, definedNames);
            }
        }

        // ── from X import Y ────────────────────────────────────────
        if ((m = line.match(RE_IMPORT_FROM))) {
            const modName = m[2];
            const modStart = line.indexOf(modName, m[1].length + 5);
            builder.push(lineIdx, modStart, modName.length, idx("namespace"), 0);
            const importsPart = m[3];
            const importsStart = line.indexOf(importsPart, modStart + modName.length);
            for (const n of importsPart.split(",")) {
                const trimmed = n.trim();
                if (!trimmed || trimmed === "*") continue;
                const parts = trimmed.split(/\s+as\s+/);
                const origName = parts[0].trim();
                const localName = (parts[1] || origName).trim();
                const origOff = line.indexOf(origName, importsStart);
                const tType = this.resolveImportedType(origName, importedNames, definedNames);
                if (origOff >= 0) builder.push(lineIdx, origOff, origName.length, idx(tType), 0);
                if (parts[1]) {
                    const localOff = line.indexOf(localName, origOff + origName.length);
                    if (localOff >= 0) builder.push(lineIdx, localOff, localName.length, idx(tType), 0);
                }
            }
        }

        // ── import X ───────────────────────────────────────────────
        if ((m = line.match(RE_IMPORT))) {
            const modsPart = m[2];
            const startOff = line.indexOf(modsPart, m[1].length + 7);
            for (const n of modsPart.split(",")) {
                const trimmed = n.trim();
                if (!trimmed) continue;
                const off = line.indexOf(trimmed, startOff);
                if (off >= 0) builder.push(lineIdx, off, trimmed.length, idx("namespace"), 0);
            }
        }

        // ── except ... as name ─────────────────────────────────────
        if ((m = line.match(RE_EXCEPT))) {
            const name = m[2];
            const off = line.lastIndexOf(name);
            builder.push(lineIdx, off, name.length, idx("variable"), 0);
        }

        // ── for target in ... ──────────────────────────────────────
        if ((m = line.match(RE_FOR))) {
            const targets = m[2];
            const tStart = line.indexOf(targets, m[1].length + 4);
            RE_IDENTIFIER.lastIndex = 0;
            let im: RegExpExecArray | null;
            while ((im = RE_IDENTIFIER.exec(targets))) {
                builder.push(lineIdx, tStart + im.index, im[0].length, idx("variable"), 0);
            }
        }

        // ── Assignment / annotated assignment ──────────────────────
        if ((m = line.match(RE_ASSIGN))) {
            const name = m[2];
            const nameOff = line.indexOf(name, m[1].length);
            const isConst = RE_ALL_CAPS.test(name);
            builder.push(lineIdx, nameOff, name.length, idx("variable"),
                isConst ? mod("readonly") : 0);
            // Type annotation
            if (m[3]) {
                this.highlightTypeRefs(line, lineIdx, nameOff + name.length, builder, importedNames, definedNames);
            }
        } else if ((m = line.match(RE_ANN_ONLY)) && !line.match(RE_FUNC_DEF) && !line.match(RE_CLASS_DEF)) {
            const name = m[2];
            const nameOff = line.indexOf(name, m[1].length);
            builder.push(lineIdx, nameOff, name.length, idx("variable"), 0);
            this.highlightTypeRefs(line, lineIdx, nameOff + name.length, builder, importedNames, definedNames);
        }

        // ── Lambda parameters ──────────────────────────────────────
        RE_LAMBDA.lastIndex = 0;
        let lambdaMatch: RegExpExecArray | null;
        while ((lambdaMatch = RE_LAMBDA.exec(line))) {
            const paramsStr = lambdaMatch[1].trim();
            const lambdaStart = lambdaMatch.index + 7; // "lambda ".length
            const params = paramsStr.split(',');
            let searchFrom = lambdaStart;
            
            for (const param of params) {
                const trimmed = param.trim();
                if (!trimmed) continue;
                // Handle default values: param=value
                const eqIdx = trimmed.indexOf('=');
                const paramName = eqIdx >= 0 ? trimmed.substring(0, eqIdx).trim() : trimmed;
                // Strip * or **
                const cleanName = paramName.replace(/^\*{1,2}/, '');
                if (!cleanName) continue;
                
                const paramOff = line.indexOf(cleanName, searchFrom);
                if (paramOff >= 0 && paramOff < lambdaMatch.index + lambdaMatch[0].length) {
                    builder.push(lineIdx, paramOff, cleanName.length, idx("parameter"), 0);
                    searchFrom = paramOff + cleanName.length;
                }
            }
        }

        // ── Comprehension variables ────────────────────────────────
        RE_COMPREHENSION.lastIndex = 0;
        let compMatch: RegExpExecArray | null;
        while ((compMatch = RE_COMPREHENSION.exec(line))) {
            const varsStr = compMatch[1].trim();
            const forStart = compMatch.index;
            // Handle tuple unpacking: for x, y in ...
            const varNames = varsStr.split(',');
            let searchFrom = forStart + 4; // "for ".length
            
            for (const varName of varNames) {
                const trimmed = varName.trim();
                if (!trimmed) continue;
                
                const varOff = line.indexOf(trimmed, searchFrom);
                if (varOff >= 0 && varOff < forStart + compMatch[0].length) {
                    builder.push(lineIdx, varOff, trimmed.length, idx("variable"), 0);
                    searchFrom = varOff + trimmed.length;
                }
            }
        }

        // ── Identifier usages in remaining expressions ─────────────
        this.highlightUsages(line, lineIdx, builder, importedNames, definedNames, inClass, multiLineStringRanges);
    }

    // ── Highlight parameters in a function signature ───────────────
    private highlightParams(
        paramsStr: string, line: string, lineIdx: number,
        builder: vscode.SemanticTokensBuilder,
        importedNames: Map<string, string>, definedNames: Map<string, string>
    ) {
        const parensOpen = line.indexOf("(");
        if (parensOpen < 0) return;
        const baseOff = parensOpen + 1;

        // Split respecting nested brackets
        const params = this.splitParams(paramsStr);
        let searchFrom = baseOff;

        for (const param of params) {
            const trimmed = param.trim();
            if (!trimmed) continue;
            // Strip leading * or **
            const stripped = trimmed.replace(/^\*{1,2}/, "");
            const colonIdx = stripped.indexOf(":");
            const eqIdx = stripped.indexOf("=");
            let nameEnd = stripped.length;
            if (colonIdx >= 0) nameEnd = colonIdx;
            else if (eqIdx >= 0) nameEnd = eqIdx;
            const paramName = stripped.substring(0, nameEnd).trim();
            if (!paramName || paramName === "/") continue;

            const paramOff = line.indexOf(paramName, searchFrom);
            if (paramOff < 0) continue;

            const isSelf = paramName === "self" || paramName === "cls";
            builder.push(lineIdx, paramOff, paramName.length, idx("parameter"),
                isSelf ? mod("selfParameter") : 0);

            // Type annotation after colon
            if (colonIdx >= 0) {
                this.highlightTypeRefs(line, lineIdx, paramOff + paramName.length, builder, importedNames, definedNames);
            }
            searchFrom = paramOff + paramName.length;
        }
    }

    private splitParams(s: string): string[] {
        const result: string[] = [];
        let depth = 0, current = "";
        for (const ch of s) {
            if (ch === "(" || ch === "[") depth++;
            else if (ch === ")" || ch === "]") depth--;
            if (ch === "," && depth === 0) { result.push(current); current = ""; }
            else current += ch;
        }
        if (current.trim()) result.push(current);
        return result;
    }

    // ── Highlight type references in annotations ───────────────────
    private highlightTypeRefs(
        line: string, lineIdx: number, startFrom: number,
        builder: vscode.SemanticTokensBuilder,
        importedNames: Map<string, string>, definedNames: Map<string, string>
    ) {
        const sub = line.substring(startFrom);
        const re = /[A-Za-z_]\w*/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(sub))) {
            const name = m[0];
            const off = startFrom + m.index;
            if (BUILTIN_TYPES.has(name) || TYPING_NAMES.has(name)) {
                builder.push(lineIdx, off, name.length, idx("class"), mod("defaultLibrary"));
            } else if (definedNames.get(name) === "class" || importedNames.get(name) === "class") {
                builder.push(lineIdx, off, name.length, idx("class"), 0);
            } else if (importedNames.has(name)) {
                builder.push(lineIdx, off, name.length, idx(importedNames.get(name)!), 0);
            }
        }
    }

    // ── Highlight identifier usages in expressions ─────────────────
    private highlightUsages(
        line: string, lineIdx: number, builder: vscode.SemanticTokensBuilder,
        importedNames: Map<string, string>, definedNames: Map<string, string>,
        _inClass: boolean,
        multiLineStringRanges: Map<number, [number, number][]>
    ) {
        // To avoid out-of-order pushing if builder doesn't sort, we collect tokens and sort them
        const tokensToPush: { char: number, length: number, type: number, mod: number }[] = [];

        const idRe = /\b([A-Za-z_]\w*)\b/g;
        let m: RegExpExecArray | null;
        
        const keywords = new Set([
            "False", "None", "True", "and", "as", "assert", "async", "await", "break", 
            "class", "continue", "def", "del", "elif", "else", "except", "finally", 
            "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", 
            "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
            "match", "case", "type"  // Python 3.10+ pattern matching and 3.12+ type aliases
        ]);

        // Combine multi-line string ranges with single-line string detection
        const stringRanges: [number, number][] = [];
        
        // Add multi-line string ranges for this line
        const multiLineRanges = multiLineStringRanges.get(lineIdx) || [];
        stringRanges.push(...multiLineRanges);
        
        // Detect single-line strings (not already covered by multi-line detection)
        RE_STRING.lastIndex = 0;
        let strMatch: RegExpExecArray | null;
        while ((strMatch = RE_STRING.exec(line))) {
            const start = strMatch.index;
            const end = start + strMatch[0].length - 1;
            
            // Only add if not already covered by multi-line string
            const overlaps = stringRanges.some(([s, e]) => 
                (start >= s && start <= e) || (end >= s && end <= e)
            );
            if (!overlaps) {
                stringRanges.push([start, end]);
            }
        }
        
        // Find comments (not inside strings)
        const commentIdx = line.indexOf('#');
        if (commentIdx >= 0) {
            const inStr = stringRanges.some(([s, e]) => commentIdx >= s && commentIdx <= e);
            if (!inStr) {
                stringRanges.push([commentIdx, line.length]);
                tokensToPush.push({ char: commentIdx, length: line.length - commentIdx, type: idx("comment"), mod: 0 });
            }
        }

        while ((m = idRe.exec(line))) {
            const name = m[1];
            const off = m.index;
            
            if (keywords.has(name)) continue;

            const inStr = stringRanges.some(([s, e]) => off >= s && off <= e);
            if (inStr) continue;

            const isAttr = off > 0 && line[off - 1] === ".";
            const afterWord = line.substring(off + name.length).trimStart();
            const isCall = afterWord.startsWith("(");
            const isKwarg = afterWord.startsWith("=");
            const isMagicMethod = RE_MAGIC_METHOD.test(name);

            if (isAttr) {
                if (isCall) {
                    // Highlight magic methods with special modifier
                    const modBits = isMagicMethod ? mod("defaultLibrary") : 0;
                    tokensToPush.push({ char: off, length: name.length, type: idx("method"), mod: modBits });
                } else if (RE_ALL_CAPS.test(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx("enumMember"), mod: 0 });
                } else {
                    tokensToPush.push({ char: off, length: name.length, type: idx("property"), mod: 0 });
                }
            } else if (isCall) {
                if (BUILTIN_FUNCTIONS.has(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx("function"), mod: mod("defaultLibrary") });
                } else if (BUILTIN_TYPES.has(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx("class"), mod: mod("defaultLibrary") });
                } else if (definedNames.get(name) === "class") {
                    tokensToPush.push({ char: off, length: name.length, type: idx("class"), mod: 0 });
                } else if (definedNames.has(name)) {
                    const t = definedNames.get(name)!;
                    const modBits = (t === "method" && isMagicMethod) ? mod("defaultLibrary") : 0;
                    tokensToPush.push({ char: off, length: name.length, type: idx(t === "constant" ? "function" : t), mod: modBits });
                } else if (importedNames.has(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx(importedNames.get(name)!), mod: 0 });
                } else {
                    tokensToPush.push({ char: off, length: name.length, type: idx("function"), mod: 0 });
                }
            } else if (isKwarg) {
                // Highlight kwargs like 'status_code=' as parameters
                tokensToPush.push({ char: off, length: name.length, type: idx("parameter"), mod: 0 });
            } else {
                if (BUILTIN_TYPES.has(name) || TYPING_NAMES.has(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx("class"), mod: mod("defaultLibrary") });
                } else if (definedNames.get(name) === "class") {
                    tokensToPush.push({ char: off, length: name.length, type: idx("class"), mod: 0 });
                } else if (definedNames.has(name)) {
                    const t = definedNames.get(name)!;
                    tokensToPush.push({ char: off, length: name.length, type: idx(t === "constant" ? "variable" : t), mod: t === "constant" ? mod("readonly") : 0 });
                } else if (importedNames.has(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx(importedNames.get(name)!), mod: 0 });
                } else if (RE_ALL_CAPS.test(name)) {
                    tokensToPush.push({ char: off, length: name.length, type: idx("variable"), mod: mod("readonly") });
                } else {
                    tokensToPush.push({ char: off, length: name.length, type: idx("variable"), mod: 0 });
                }
            }
        }

        // Push sorted tokens (they are already sorted by off since regex scans left-to-right)
        for (const t of tokensToPush) {
            // we catch errors in case of overlapping tokens pushed in pass 1 vs pass 2
            try {
                builder.push(lineIdx, t.char, t.length, t.type, t.mod);
            } catch (e) { /* ignore out of order / overlap */ }
        }
    }

    private resolveImportedType(
        name: string,
        importedNames: Map<string, string>,
        definedNames: Map<string, string>
    ): string {
        if (BUILTIN_TYPES.has(name) || TYPING_NAMES.has(name)) return "class";
        if (BUILTIN_FUNCTIONS.has(name)) return "function";
        if (definedNames.has(name)) return definedNames.get(name)!;
        if (importedNames.has(name)) return importedNames.get(name)!;
        return "namespace";
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function idx(tokenType: string): number {
    const i = tokenTypes.indexOf(tokenType);
    return i >= 0 ? i : tokenTypes.indexOf("variable");
}

function mod(...names: string[]): number {
    let bits = 0;
    for (const n of names) {
        const i = tokenModifiers.indexOf(n);
        if (i >= 0) bits |= 1 << i;
    }
    return bits;
}
