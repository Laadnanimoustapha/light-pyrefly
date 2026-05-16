# Triple-Quoted String Fix

## Problem
Identifiers inside triple-quoted strings (including docstrings) were being highlighted as code, which was incorrect.

**Before:**
```python
"""
This docstring mentions square and add
"""  # ← square and add were incorrectly highlighted
```

## Solution
Implemented a document-level pre-pass that detects multi-line triple-quoted strings before tokenization.

### Implementation Details

1. **New Method: `detectMultiLineStrings()`**
   - Scans the entire document before tokenization
   - Tracks triple-quoted string boundaries (`"""` and `'''`)
   - Handles string prefixes (r, f, b, u, etc.)
   - Returns a map of line numbers to character ranges that are inside strings

2. **Updated Token Provider Flow**
   ```
   Old: Pass 1 (collect definitions) → Pass 2 (tokenize)
   New: Pre-pass (detect strings) → Pass 1 (collect definitions) → Pass 2 (tokenize)
   ```

3. **Modified Functions**
   - `provideDocumentSemanticTokens()` - Calls `detectMultiLineStrings()` before tokenization
   - `tokenizeLine()` - Accepts `multiLineStringRanges` parameter
   - `highlightUsages()` - Checks both multi-line and single-line string ranges

### How It Works

```typescript
// Pre-pass: Build a map of string ranges
const multiLineStringRanges = this.detectMultiLineStrings(document);
// Returns: Map<lineNumber, [[start, end], [start, end], ...]>

// During tokenization: Check if identifier is inside a string
const inStr = stringRanges.some(([s, e]) => off >= s && off <= e);
if (inStr) continue; // Skip highlighting
```

### Edge Cases Handled

1. **Single-line triple quotes**: `"""all on one line"""`
2. **String prefixes**: `f"""..."""`, `r'''...'''`
3. **Nested quotes**: `"""String with "nested" quotes"""`
4. **Multiple strings per line**: `"""str1""" + """str2"""`
5. **Unclosed strings**: Marks to end of document
6. **Empty triple quotes**: `""""""`

## Testing

Use `TEST_TRIPLE_QUOTES.py` to verify:
- Docstrings don't highlight identifiers
- Multi-line strings work correctly
- Code after strings is still highlighted
- F-strings with expressions work

## Results

**After the fix:**
```python
"""
This docstring mentions square and add
"""  # ← square and add are NOT highlighted ✓

# But outside strings, they are highlighted:
result = square(5) + add(3, 4)  # ← Correctly highlighted ✓
```

## Performance Impact

- Minimal: One additional document scan at the start
- Complexity: O(n) where n = total characters in document
- Trade-off: Slightly slower initial tokenization for much better accuracy
