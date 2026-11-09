/* =========================================================
   CONTENU MODIFIABLE — c'est le seul fichier à toucher
   pour ajouter des concerts ou des photos.
   ========================================================= */

/*
   AGENDA
   - date  : "AAAA-MM-JJ" (les dates passées basculent toutes seules dans "Déjà joué")
   - heure, lieu, ville, type : texte libre
   - lien  : facultatif (billetterie, page Facebook de l'événement…)
   - aConfirmer : true pour afficher l'étiquette « À confirmer »
*/
const EVENTS = [
    { date: "2026-10-30", heure: "20h00", titre: "Prestation de la fanfare", ville: "La Ferté-sous-Jouarre", type: "Fanfare" },
    { date: "2026-10-31", heure: "10h – 12h", titre: "Prestation du marching band", ville: "La Ferté-sous-Jouarre", type: "Marching band" },
    { date: "2026-11-08", titre: "Concert de l'harmonie (CMF)", ville: "Beaumont-sur-Oise (95)", type: "Harmonie" },
    { date: "2026-11-11", titre: "Cérémonie du 11 Novembre", ville: "La Ferté-sous-Jouarre", type: "Fanfare", aConfirmer: true },
    { date: "2026-11-21", titre: "Concert de la Sainte-Cécile", ville: "Saint-Jean", type: "Harmonie" },
    { date: "2026-11-28", heure: "17h00", titre: "Prestation du marching band", ville: "Mareuil-lès-Meaux", type: "Marching band" },
    { date: "2026-11-28", titre: "Concert de la Sainte-Cécile", ville: "Boissy-le-Châtel", type: "Harmonie" },
    { date: "2026-12-04", titre: "Illuminations", ville: "La Ferté-sous-Jouarre", type: "Animation" },
    { date: "2026-12-05", titre: "Téléthon", ville: "Boissy-le-Châtel", type: "Animation" },
    { date: "2026-12-19", heure: "En soirée", titre: "Concert", ville: "Trélou-sur-Marne (02)", type: "Harmonie" },
    { date: "2027-01-09", heure: "15h00", titre: "Concert de l'harmonie", ville: "Chevry-Cossigny", type: "Harmonie", aConfirmer: true },
    { date: "2027-01-17", heure: "16h00", titre: "Concert du Jour de l'An", lieu: "La Sucrerie", type: "Harmonie" },
    { date: "2027-03-21", titre: "Concert caritatif", ville: "Pontault-Combault", type: "Harmonie" },
    { date: "2027-11-14", titre: "Rassemblement CMF : concert individuel et morceau en commun", ville: "Vaires-sur-Marne", type: "Harmonie" }
];

/*
   ÉCOUTER (lecteur de l'accueil)
   - Déposer les .mp3 dans le dossier audio/
   - Puis ajouter une ligne ici : { titre: "...", src: "audio/nom.mp3" }
*/
const TRACKS = [
    { titre: "The Witch and the Saint", src: "audio/the-witch-and-the-saint.mp3" },
    { titre: "Dans les yeux d'Émilie", src: "audio/dans-les-yeux-demilie.mp3" },
    { titre: "France Gall", src: "audio/france-gall.mp3" },
    { titre: "Forrest Gump", src: "audio/forrest-gump.mp3" },
    { titre: "A Klezmer Karnival", src: "audio/a-klezmer-karnival.mp3" }
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
