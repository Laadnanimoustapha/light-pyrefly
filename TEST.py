import os
import secrets
import string
from typing import List, Optional, Dict, Any 

# Generic constants for testing semantic highlighting
DEFAULT_LIMIT = 100
MAX_RETRIES = 5
API_VERSION = "1.0.0"

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