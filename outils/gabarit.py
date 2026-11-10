"""Applique l'en-tête et le pied de page communs à toutes les pages du site.

Chaque page garde ce qui lui est propre : son <title>, sa description,
le contenu de <main> et ses scripts particuliers (3D, espace membres…).
Tout le reste (head, menu, pied de page) vient de ce fichier.

Pour modifier le menu ou le pied de page : changer ce fichier, puis
    python outils/gabarit.py
"""
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
VERSION = 20  # à incrémenter quand style.css, data.js ou main.js changent (cache des navigateurs)

NAV = [
    ("index.html", "fa-house", "Accueil"),
    ("association.html", "fa-people-group", "L'association"),
    ("instruments.html", "fa-drum", "Instruments"),
    ("agenda.html", "fa-calendar-days", "Agenda"),
    ("galerie.html", "fa-images", "Galerie"),
    ("livre-dor.html", "fa-feather-pointed", "Livre d'or"),
]
MAPS = "https://www.google.com/maps/search/?api=1&amp;query=Rue+des+Carri%C3%A8res+77169+Boissy-le-Ch%C3%A2tel"


def head(title, desc, robots):
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
{'    <meta name="robots" content="noindex">' + chr(10) if robots else ''}    <meta name="description" content="{desc}">
    <meta name="theme-color" content="#16090b">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{desc}">
    <meta property="og:image" content="images/logo.png">
    <link rel="icon" href="favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="192x192" href="images/favicon-192.png">
    <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Paytone+One&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="css/style.css?v={VERSION}">
</head>
<body>
"""


def header(page):
    links = "\n".join(
        f'                <a href="{href}" class="nav-link{" active" if href == page else ""}"><i class="fas {icon}"></i> {label}</a>'
        for href, icon, label in NAV)
    act = lambda p: " active" if p == page else ""
    return f"""    <div class="scroll-progress" id="scrollProgress"></div>
    <header class="site-header" id="header">
        <div class="header-inner">
            <a href="index.html" class="logo" aria-label="Des Lyres en Brie - accueil">
                <img class="logo-mark" src="images/logo-mark.png" alt="" width="57" height="42">
                <span class="logo-text">Des Lyres <em>en Brie</em></span>
            </a>
            <nav class="main-nav" id="mainNav">
{links}
                <span class="nav-actions">
                    <a href="membres.html" class="nav-btn nav-btn-ghost{act('membres.html')}"><i class="fas fa-lock"></i> Membres</a>
                    <a href="contact.html" class="nav-btn nav-btn-primary{act('contact.html')}"><i class="fas fa-envelope"></i> Contact</a>
                </span>
            </nav>
            <button class="hamburger" id="hamburger" aria-label="Ouvrir le menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>
        </div>
    </header>

"""


def footer(extra_scripts):
    extra = "".join(f"    {s}\n" for s in extra_scripts)
    return f"""
    <footer class="site-footer wave-top">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-about">
                    <a href="index.html" aria-label="Des Lyres en Brie - accueil"><img class="footer-logo" src="images/logo.webp" alt="Des Lyres en Brie" width="150" height="186" loading="lazy"></a>
                    <p>Association musicale loi 1901 : faire vivre la musique en Brie, ensemble.</p>
                    <div class="socials">
                        <a href="#" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>
                        <a href="#" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
                    </div>
                </div>
                <div>
                    <h4>Navigation</h4>
                    <ul>
                        <li><a href="association.html">L'association</a></li>
                        <li><a href="instruments.html">Instruments</a></li>
                        <li><a href="agenda.html">Agenda</a></li>
                        <li><a href="galerie.html">Galerie</a></li>
                        <li><a href="livre-dor.html">Livre d'or</a></li>
                        <li><a href="membres.html">Espace membres</a></li>
                    </ul>
                </div>
                <div>
                    <h4>Contact</h4>
                    <ul>
                        <li><a href="mailto:contact@deslyresenbrie.fr"><i class="far fa-envelope"></i> contact@deslyresenbrie.fr</a></li>
                        <li><a href="{MAPS}" target="_blank" rel="noopener"><i class="fas fa-location-dot"></i> Rue des Carrières<br>77169 Boissy-le-Châtel</a></li>
                        <li><a href="contact.html"><i class="fas fa-paper-plane"></i> Nous écrire</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <span>&copy; <span class="year"></span> Des Lyres en Brie</span>
                <span>Fait avec <i class="fas fa-heart"></i> et beaucoup de musique</span>
            </div>
        </div>
    </footer>

    <button class="to-top" id="toTop" type="button" aria-label="Revenir en haut de la page"><i class="fas fa-arrow-up"></i></button>

    <script src="js/data.js?v={VERSION}"></script>
{extra}    <script src="js/main.js?v={VERSION}"></script>
</body>
</html>
"""


def rebuild(path):
    src = path.read_text(encoding="utf-8")
    title = re.search(r"<title>(.*?)</title>", src, re.S).group(1).strip()
    desc = re.search(r'<meta name="description" content="([^"]*)"', src).group(1)
    robots = 'name="robots"' in src
    main = re.search(r"<main>(.*)</main>", src, re.S).group(1)
    tail = src[src.index("</main>"):]
    scripts = [s for s in re.findall(r"<script\b.*?</script>", tail, re.S)
               if "js/data.js" not in s and "js/main.js" not in s]
    path.write_text(head(title, desc, robots) + header(path.name) + "    <main>" + main + "</main>\n"
                    + footer(scripts), encoding="utf-8", newline="\n")
    return len(scripts)


if __name__ == "__main__":
    for page in sorted(SITE.glob("*.html")):
        n = rebuild(page)
        print(f"{page.name:20} ok ({n} script(s) propre(s))")
