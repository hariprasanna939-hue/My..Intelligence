"""Unit tests for sample calculator."""

import pytest
from calculator import add, subtract, multiply, divide, average


def test_add():
    assert add(2, 3) == 5
    assert add(-1, 1) == 0


def test_subtract():
    assert subtract(10, 4) == 6
    assert subtract(5, 10) == -5


def test_multiply():
    assert multiply(3, 4) == 12
    assert multiply(5, 0) == 0


def test_divide():
    assert divide(10, 2) == 5.0
    with pytest.raises(ValueError, match="Cannot divide by zero"):
        divide(5, 0)


def test_average():
    assert average([1, 2, 3, 4, 5]) == 3.0
    with pytest.raises(ValueError, match="empty list"):
        average([])
