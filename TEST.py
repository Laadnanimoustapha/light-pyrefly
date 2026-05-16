import os
import secrets
import string
from typing import List, Optional, Dict, Any 

# Generic constants for testing semantic highlighting
DEFAULT_LIMIT = 100
MAX_RETRIES = 5
API_VERSION = "1.0.0"
"""
=== VISUAL TEST FILE FOR LIGHT PYREFLY ===

This docstring should NOT have any highlighted identifiers.
Words like: square, add, MyClass, lambda, def, class
Should all appear as plain docstring text.
"""

# ============================================
# Test 1: Lambda Parameters
# ============================================
# Parameters x, a, b, y should be highlighted
square = lambda x: x ** 2
add = lambda a, b: a + b
default_param = lambda x, y=10: x + y

# ============================================
# Test 2: Comprehension Variables
# ============================================
# Variables x, n, k, v, item should be highlighted
numbers = [x for x in range(10)]
squares = [n**2 for n in numbers]
dict_comp = {k: v for k, v in enumerate(numbers)}
set_comp = {item for item in numbers if item > 5}

# ============================================
# Test 3: Magic Methods
# ============================================
class MyClass:
    # __init__, __str__, __add__ should be highlighted specially
    def __init__(self, value):
        self.value = value
    
    def __str__(self):
        return f"MyClass({self.value})"
    
    def __add__(self, other):
        return MyClass(self.value + other.value)
    
    # regular_method should be highlighted normally
    def regular_method(self):
        return self.__str__()  # __str__ usage also special

# ============================================
# Test 4: Triple-Quoted Strings
# ============================================

def example_function():
    """
    This is a docstring.
    
    It mentions: square, add, MyClass, lambda
    None of these should be highlighted!
    
    Even code-like text:
        x = square(5)
        result = add(1, 2)
    
    Should NOT be highlighted.
    """
    pass

# Multi-line string (not a docstring)
description = """
This string also mentions:
square, add, MyClass
These should NOT be highlighted either!
"""

# ============================================
# Test 5: Match/Case Keywords (Python 3.10+)
# ============================================
def check_value(value):
    # match and case should be keywords (not highlighted as variables)
    match value:
        case 1:
            return "one"
        case 2:
            return "two"
        case _:
            return "other"

# ============================================
# Test 6: Mixed Scenarios
# ============================================

# Inside strings: NOT highlighted
text = "The square function and add function"

# Outside strings: SHOULD be highlighted
result = square(5) + add(3, 4)

# F-string expressions: SHOULD be highlighted
output = f"Result: {square(10)}"

# Triple-quoted with code after
data = """string data""" + square(2)  # square should be highlighted

# ============================================
# Test 7: Edge Cases
# ============================================

# Nested comprehensions
matrix = [[cell for cell in row] for row in [[1,2], [3,4]]]

# Lambda in comprehension
funcs = [lambda x: x + i for i in range(5)]

# Magic method calls
obj = MyClass(42)
print(obj)  # Calls __str__
result = obj + MyClass(8)  # Calls __add__

# Class with multiple magic methods
class Advanced:
    def __init__(self): pass
    def __repr__(self): pass
    def __len__(self): pass
    def __getitem__(self, key): pass
    def normal_method(self): pass  # Should be different from magic methods

print("✓ Visual test complete")

class TestModel:
    """A sample class to test semantic highlighting."""
    
    def __init__(self, name: str, value: int = 0):
        self.name = name
        self.value = value
        self._internal_state = secrets.token_hex(8)

    def process_data(self, data: List[str]) -> Dict[str, Any]:
        # Testing local variables and built-ins
        processed = [item.strip().upper() for item in data if item]
        count = len(processed)
        
        return {
            "name": self.name,
            "count": count,
            "items": processed,
            "id": self._internal_state
        }

@staticmethod
def utility_function(param: Optional[str] = None) -> bool:
    if param is None:
        return False
    return param.isalnum()

async def async_test_function(timeout: float = 1.5):
    # Testing async/await and numeric literals
    print(f"Starting async test with timeout {timeout}...")
    
    for i in range(MAX_RETRIES):
        if i > 2:
            break
        print(f"Retry {i}...")
    
    return True

if __name__ == "__main__":
    # Testing main block and instantiation
    tester = TestModel(name="HighlighterTest")
    result = tester.process_data(["hello", "world", "  python  "])
    
    print(result)
    
    # Testing built-in types
    my_list: List[int] = [1, 2, 3]
    my_dict: Dict[str, str] = {"key": "value"}
    my_none = None
    my_bool = True