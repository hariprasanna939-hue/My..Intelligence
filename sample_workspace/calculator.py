\"\"\"Sample mathematical utility module for testing ForgeLocal.\"\"\"

from typing import List, Union


def add(a: Union[int, float], b: Union[int, float]) -> Union[int, float]:
    \"\"\"Adds two numbers.\"\"\"
    return a + b


def subtract(a: Union[int, float], b: Union[int, float]) -> Union[int, float]:
    \"\"\"Subtracts b from a.\"\"\"
    return a - b


def multiply(a: Union[int, float], b: Union[int, float]) -> Union[int, float]:
    \"\"\"Multiplies two numbers.\"\"\"
    return a * b


def divide(a: Union[int, float], b: Union[int, float]) -> float:
    \"\"\"Divides a by b. Raises ValueError if b is zero.\"\"\"
    if b == 0:
        raise ValueError(\"Cannot divide by zero.\")
    return a / b


def average(numbers: List[Union[int, float]]) -> float:
    \"\"\"Calculates the arithmetic mean of a list of numbers.\"\"\"
    if not numbers:
        raise ValueError(\"Cannot compute average of empty list.\")
    return sum(numbers) / len(numbers)


def square(x: Union[int, float]) -> Union[int, float]:
    \"\"\"Returns the square of a number.\"\"\"
    return x * x
