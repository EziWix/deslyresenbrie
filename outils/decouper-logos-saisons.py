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
    "noel": (15, 0, 506, 514),
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
    # poches de fond un peu rosées (reflet rouge du logo) : gris moyen peu saturé, zone épaisse,
    # puis on s'étend de proche en proche sur toute la poche (bords compris)
    cand = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            lum = (r + g + b) / 3
            if not vu[y * w + x] and 80 < lum < 206 and max(r, g, b) - min(r, g, b) < 80:
                cand[y * w + x] = 1
    cmask = Image.frombytes("L", (w, h), bytes(v * 255 for v in cand))
    graines = cmask.filter(ImageFilter.MinFilter(9)).load()
    depart = [(x, y) for y in range(h) for x in range(w) if graines[x, y]]
    poche = remplit(w, h, lambda x, y: cand[y * w + x] == 1, depart)
    masque = Image.new("L", (w, h), 255)
    mp = masque.load()
    for y in range(h):
        for x in range(w):
            if vu[y * w + x] or (pp[x, y] and gp[x, y]) or poche[y * w + x]:
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


def grand_logo(nom):
    """Logo de saison + le texte « DES LYRES EN BRIE » repris du grand logo (pour l'accueil)."""
    logo = Image.open(SITE / "images" / "logo.png").convert("RGBA")
    texte = logo.crop((0, 524, logo.width, 775))
    texte = texte.crop(texte.getbbox())
    saison = Image.open(OUT / f"{nom}.webp").convert("RGBA")
    h = 560
    saison = saison.resize((round(saison.width * h / saison.height), h), Image.LANCZOS)
    chevauche = 26
    W = max(texte.width, saison.width)
    out = Image.new("RGBA", (W, h + texte.height - chevauche), (0, 0, 0, 0))
    out.alpha_composite(saison, ((W - saison.width) // 2, 0))
    out.alpha_composite(texte, ((W - texte.width) // 2, h - chevauche))
    out.save(OUT / f"{nom}-grand.webp", quality=90, method=6)
    print(f"{nom}-grand  {out.size}")
