# Test file for Light Pyrefly improvements

# 1. Match/case keywords (Python 3.10+)
def check_value(value):
    match value:
        case 1:
            return "one"
        case 2:
            return "two"
        case _:
            return "other"

# 2. Lambda parameter detection
square = lambda x: x ** 2
add = lambda a, b: a + b
default_param = lambda x, y=10: x + y

# 3. Improved string literal regex
regular_string = "hello"
raw_string = r"C:\path\to\file"
byte_string = b"bytes"
f_string = f"value is {square(5)}"
triple_quoted = """
Multi-line
string with identifiers like square and add
that should NOT be highlighted
"""
single_triple = '''Another multi-line
with words like class and def
that should NOT be highlighted'''

# Triple-quoted docstrings
def example_function():
    """
    This is a docstring with words like:
    - square
    - add
    - MyClass
    These should NOT be highlighted as code
    """
    pass

class ExampleClass:
    """
    Class docstring with identifiers:
    square, add, regular_string
    Should NOT be highlighted
    """
    
    def method(self):
        '''
        Method docstring
        with square and add
        '''
        return "result"

# 4. Comprehension variable detection
numbers = [x for x in range(10)]
squares = [n**2 for n in numbers]
pairs = [(x, y) for x in range(3) for y in range(3)]
dict_comp = {k: v for k, v in enumerate(numbers)}
set_comp = {item for item in numbers if item > 5}

# Nested comprehensions
matrix = [[cell for cell in row] for row in [[1,2], [3,4]]]

# 5. Magic method highlighting
class MyClass:
    def __init__(self, value):
        self.value = value
    
    def __str__(self):
        return f"MyClass({self.value})"
    
    def __repr__(self):
        return self.__str__()
    
    def __add__(self, other):
        return MyClass(self.value + other.value)
    
    def __len__(self):
        return len(str(self.value))
    
    def __getitem__(self, key):
        return self.value[key]
    
    def __setitem__(self, key, value):
        self.value[key] = value
    
    def regular_method(self):
        # Magic methods should be highlighted differently
        return self.__str__()

# Using magic methods
obj = MyClass(42)
print(obj)  # Calls __str__
result = obj + MyClass(8)  # Calls __add__
length = len(obj)  # Calls __len__

# Comments should still work # inline comment
x = 5  # another comment

# String with # hash should not be treated as comment
text = "This # is not a comment"
