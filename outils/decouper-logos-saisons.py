"""Découpe les 5 logos de saison (planche fournie par l'user) avec fond transparent.

    python outils/decouper-logos-saisons.py <planche.webp>

Écrit images/saisons/<saison>.png (et .webp). Le fond gris est retiré par
remplissage depuis les bords : il s'arrête sur le contour blanc des autocollants.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "images" / "saisons"

# zones approximatives de chaque autocollant sur la planche 1536 x 1024
ZONES = {
    "noel": (40, 30, 505, 505),
    "paques": (530, 30, 1010, 505),
    "ete": (1020, 30, 1500, 505),
    "halloween": (260, 510, 730, 1010),
    "14-juillet": (760, 510, 1300, 1010),
}


def est_fond(px):
    r, g, b = px[:3]
    return max(r, g, b) - min(r, g, b) < 34 and max(r, g, b) < 222


def remplit(w, h, ok, depart):
    """Remplissage 4-connexe : renvoie les pixels atteints depuis `depart` en passant par `ok`."""
    vu = bytearray(w * h)
    q = deque(depart)
    while q:
        x, y = q.popleft()
        i = y * w + x
        if vu[i] or not ok(x, y):
            continue
        vu[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    return vu


def detoure(im):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    # le contour blanc de l'autocollant, épaissi pour boucher ses petits trous
    blanc = im.convert("L").point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MaxFilter(7))
    bp = blanc.load()
    bords = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + \
            [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    vu = remplit(w, h, lambda x, y: bp[x, y] == 0 and est_fond(px[x, y]), bords)
    # on récupère la fine bande grise laissée par l'épaississement (3 px au plus)
    for _ in range(3):
        ajout = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                i = y * w + x
                if not vu[i] and est_fond(px[x, y]) and sum(px[x, y][:3]) < 600 and (
                        vu[i - 1] or vu[i + 1] or vu[i - w] or vu[i + w]):
                    ajout.append(i)
        for i in ajout:
            vu[i] = 1
    # poches de fond enfermées (entre la baguette et la lyre…) : zones grises épaisses,
    # repérées par une ouverture morphologique pour ignorer les fins liserés d'anticrénelage
    gris = Image.new("L", (w, h), 0)
    gp = gris.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if max(r, g, b) - min(r, g, b) < 26 and 70 < (r + g + b) / 3 < 200:
                gp[x, y] = 255
    poches = gris.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(9))
    pp = poches.load()
    masque = Image.new("L", (w, h), 255)
    mp = masque.load()
    for y in range(h):
        for x in range(w):
            if vu[y * w + x] or (pp[x, y] and gp[x, y]):
                mp[x, y] = 0
    # bord adouci (anticrénelage) sans manger le contour blanc
    masque = masque.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(masque)
    return im.crop(masque.point(lambda a: 255 if a > 8 else 0).getbbox())


def main():
    planche = Image.open(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    noms = sys.argv[2:] or ["noel"]
    for nom in noms:
        zone = ZONES[nom]
        logo = detoure(planche.crop(zone))
        logo.save(OUT / f"{nom}.png", optimize=True)
        logo.save(OUT / f"{nom}.webp", quality=90, method=6)
        print(f"{nom:12} {logo.size}")


if __name__ == "__main__":
    main()
