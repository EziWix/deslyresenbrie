/* =========================================================
   CONTENU MODIFIABLE — c'est le seul fichier à toucher
   pour ajouter des concerts ou des photos.
   ========================================================= */

/*
   AGENDA
   - date  : "AAAA-MM-JJ" (les dates passées basculent toutes seules dans "Déjà joué")
   - heure, lieu, ville, type : texte libre
   - lien  : facultatif (billetterie, page Facebook de l'événement…)
*/
const EVENTS = [
    {
        date: "2026-12-12",
        heure: "20h30",
        titre: "Premier concert de l'association",
        lieu: "Salle des fêtes",
        ville: "À définir",
        type: "Concert"
    },
    {
        date: "2027-01-17",
        heure: "15h00",
        titre: "Concert du Nouvel An",
        lieu: "Église",
        ville: "À définir",
        type: "Concert"
    },
    {
        date: "2027-03-20",
        heure: "14h00",
        titre: "Après-midi portes ouvertes",
        lieu: "Salle de répétition",
        ville: "À définir",
        type: "Portes ouvertes"
    }
];

/*
   GALERIE
   - Déposer les photos dans le dossier images/galerie/
   - Puis ajouter une ligne ici : { src: "images/galerie/nom.jpg", legende: "..." }
*/
const PHOTOS = [
    // { src: "images/galerie/repetition-1.jpg", legende: "Première répétition" },
];

/*
   FORMULAIRE DE CONTACT
   Clé gratuite à créer sur https://web3forms.com (les messages arrivent par mail).
   Tant qu'elle est vide, le formulaire affiche un message d'erreur.
*/
const WEB3FORMS_KEY = "";
