# Test file for triple-quoted string handling

# Define some variables and functions
square = lambda x: x ** 2
add = lambda a, b: a + b

class MyClass:
    def __init__(self):
        pass

# Test 1: Triple-quoted string with identifiers
text1 = """
This string contains identifiers like:
square, add, MyClass
These should NOT be highlighted as code!
"""

# Test 2: Single-quoted triple string
text2 = '''
More identifiers:
square
add
MyClass
lambda
def
class
Still should NOT be highlighted!
'''

# Test 3: Docstring at module level
"""
Module docstring with:
square, add, MyClass, lambda
Should NOT highlight these
"""

# Test 4: Function with docstring
def my_function(param1, param2):
    """
    Function docstring.
    
    Uses square and add functions.
    Also mentions MyClass.
    
    Args:
        param1: First parameter
        param2: Second parameter
    
    Returns:
        Result using square(param1) + add(param1, param2)
    """
    return square(param1) + add(param1, param2)

# Test 5: Class with docstring
class TestClass:
    """
    Class docstring mentioning:
    - square function
    - add function  
    - MyClass
    - lambda expressions
    
    None of these should be highlighted!
    """
    
    def method(self):
        """Method docstring with square and add"""
        pass

# Test 6: Multi-line f-string (Python 3.12+)
result = f"""
The square of 5 is {square(5)}
The sum of 3 and 4 is {add(3, 4)}
"""

# Test 7: Raw triple-quoted string
path = r"""
C:\Users\square\Documents\add\MyClass
"""

# Test 8: Nested quotes
text3 = """
String with "nested" quotes and 'single' quotes
Identifiers: square, add, MyClass
"""

# Test 9: Code after triple-quoted string on same line (edge case)
x = """string""" + square(10)  # square should be highlighted here

# Test 10: Empty triple-quoted string
empty = """"""

# Test 11: Triple-quoted string with escape sequences
escaped = """
Line with \n newline
Identifiers: square, add
"""

print("Test complete")
