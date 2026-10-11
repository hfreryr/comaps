import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

from common import normalize_name  # noqa: E402
from compare import dist_m  # noqa: E402


def test_normalize_name():
    assert normalize_name("Le Café de Flore") == "cafe flore"
    assert normalize_name("Oh my Burger !") == normalize_name("OH MY BURGER")
    assert normalize_name(None) == ""


def test_distance():
    # environ 111 m pour 0,001° de latitude
    assert 105 < dist_m(48.85, 2.33, 48.851, 2.33) < 117
