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
const RE_COMMENT       = /^(\s*)#(.*)$/;
const RE_CLASS_DEF     = /^(\s*)class\s+([A-Za-z_]\w*)/;
const RE_FUNC_DEF      = /^(\s*)(async\s+)?def\s+([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?\s*\(([^)]*)\)/;
const RE_DECORATOR     = /^(\s*)@([A-Za-z_][\w.]*)/;
const RE_IMPORT_FROM   = /^(\s*)from\s+([\w.]+)\s+import\s+(.+)$/;
const RE_IMPORT        = /^(\s*)import\s+(.+)$/;
const RE_ASSIGN        = /^(\s*)([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*=(?!=)/;
const RE_ANN_ONLY      = /^(\s*)([A-Za-z_]\w*)\s*:\s*(.+)$/;
const RE_FOR           = /^(\s*)(?:async\s+)?for\s+(.+?)\s+in\s+/;
const RE_WITH          = /^(\s*)(?:async\s+)?with\s+(.+):\s*$/;
const RE_EXCEPT        = /^(\s*)except\s+.*\bas\s+([A-Za-z_]\w*)/;
const RE_RETURN_ARROW  = /->\s*([A-Za-z_][\w\[\], |.]*)\s*:/;
const RE_IDENTIFIER    = /[A-Za-z_]\w*/g;
const RE_ALL_CAPS      = /^[A-Z][A-Z0-9_]+$/;

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

        // Pass 1: collect definitions & imports so pass-2 can colour usages
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            this.collectDefinitions(line, i, scopes, importedNames, definedNames);
        }

        // Reset scopes for pass 2
        scopes.length = 0;

        // Pass 2: emit tokens
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            this.tokenizeLine(line, i, builder, scopes, importedNames, definedNames);
        }

        return builder.build();
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
                    importedNames.set(local, "namespace");
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
        definedNames: Map<string, string>
    ) {
        const indent = line.search(/\S/);
        if (indent < 0) return;
        while (scopes.length && indent <= scopes[scopes.length - 1].indent) scopes.pop();
        const inClass = scopes.length > 0 && scopes[scopes.length - 1].kind === "class";

        let m: RegExpMatchArray | null;

        // ── Comments ───────────────────────────────────────────────
        if ((m = line.match(RE_COMMENT))) {
            builder.push(lineIdx, m[1].length, line.length - m[1].length, idx("comment"), 0);
            return;
        }

        // ── Decorators ─────────────────────────────────────────────
        if ((m = line.match(RE_DECORATOR))) {
            builder.push(lineIdx, m[1].length, 1 + m[2].length, idx("decorator"), 0);
            return;
        }

        // ── Class definition ───────────────────────────────────────
        if ((m = line.match(RE_CLASS_DEF))) {
            const nameStart = line.indexOf(m[2], m[1].length + 5);
            builder.push(lineIdx, nameStart, m[2].length, idx("class"), mod("declaration"));
            scopes.push({ indent, kind: "class" });
            // Base classes after the name
            this.highlightTypeRefs(line, lineIdx, nameStart + m[2].length, builder, importedNames, definedNames);
            return;
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
            return;
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
            return;
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
            return;
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

        // ── Identifier usages in remaining expressions ─────────────
        this.highlightUsages(line, lineIdx, builder, importedNames, definedNames, inClass);
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
        _inClass: boolean
    ) {
        // Find function-call patterns: name(
        const callRe = /\b([A-Za-z_]\w*)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = callRe.exec(line))) {
            const name = m[1];
            const off = m.index;
            if (["def", "class", "if", "elif", "while", "for", "with", "except",
                 "return", "yield", "assert", "import", "from", "raise", "del",
                 "not", "and", "or", "in", "is", "lambda", "as", "pass",
                 "break", "continue", "try", "finally", "global", "nonlocal",
                 "async", "await", "match", "case", "type"].includes(name)) continue;
            if (BUILTIN_FUNCTIONS.has(name)) {
                builder.push(lineIdx, off, name.length, idx("function"), mod("defaultLibrary"));
            } else if (BUILTIN_TYPES.has(name)) {
                builder.push(lineIdx, off, name.length, idx("class"), mod("defaultLibrary"));
            } else if (definedNames.get(name) === "class") {
                builder.push(lineIdx, off, name.length, idx("class"), 0);
            } else if (definedNames.has(name)) {
                const t = definedNames.get(name)!;
                builder.push(lineIdx, off, name.length, idx(t === "constant" ? "function" : t), 0);
            } else if (importedNames.has(name)) {
                builder.push(lineIdx, off, name.length, idx(importedNames.get(name)!), 0);
            }
        }

        // Attribute access: .name
        const attrRe = /\.([A-Za-z_]\w*)/g;
        while ((m = attrRe.exec(line))) {
            const name = m[1];
            const off = m.index + 1; // skip the dot
            // Check if followed by ( → method/function call
            const afterAttr = line.substring(off + name.length).trimStart();
            if (afterAttr.startsWith("(")) {
                builder.push(lineIdx, off, name.length, idx("method"), 0);
            } else if (RE_ALL_CAPS.test(name)) {
                builder.push(lineIdx, off, name.length, idx("enumMember"), 0);
            } else {
                builder.push(lineIdx, off, name.length, idx("property"), 0);
            }
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
