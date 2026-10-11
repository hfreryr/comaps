"""Fonctions partagées : chemins, normalisation des noms."""
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "out"

# Codes INSEE des arrondissements de Paris : 75101 … 75120
def insee_arrondissement(n: int) -> str:
    return f"751{n:02d}"


_STOP = {"le", "la", "les", "l", "de", "du", "des", "d", "et", "a", "au", "aux",
         "chez", "the", "paris", "sarl", "sas"}


def normalize_name(name: str | None) -> str:
    """Minuscules, sans accents ni ponctuation ni mots vides."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(w for w in s.split() if w not in _STOP)
