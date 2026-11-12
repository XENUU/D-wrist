/* ==========================================================================
   D-wrist — Catalogue des morceaux
   --------------------------------------------------------------------------
   Ce fichier est chargé par une simple balise <script> dans index.html
   (pas de fetch) : le site fonctionne donc aussi en ouvrant index.html
   directement depuis ton ordinateur (file://).

   ➜ COMMENT AJOUTER UN MORCEAU
   1. Dépose la cover dans le dossier /covers
      (jpg, png ou webp — carrée de préférence, ex. 1000×1000 px).
   2. Dépose le fichier audio dans le dossier /audio
      (.mp3 recommandé pour le web car plus léger ; .wav fonctionne aussi).
   3. Copie un bloc { ... } ci-dessous, colle-le dans le tableau TRACKS
      (n'oublie pas la virgule entre deux blocs) et modifie :
        - id     : identifiant unique, en minuscules, sans espaces ni accents
                   (ex. "ghost-mode"). Il sert d'URL directe :
                   https://ton-site.github.io/#ghost-mode
        - title  : le titre affiché
        - artist : "D-wrist"
        - cover  : chemin vers l'image (ex. "covers/ghost-mode.jpg")
        - audio  : chemin vers le son  (ex. "audio/ghost-mode.mp3")
        - lyrics : paroles au format LRC entre deux backticks ` `
                   → laisse `` (vide) s'il n'y a pas encore de paroles :
                     le site affichera « Paroles bientôt disponibles ».
   4. L'ordre du tableau = l'ordre des covers dans le carrousel.

   ➜ FORMAT LRC
   Une ligne = un timestamp + le texte :   [mm:ss.xx] texte de la ligne
   Exemple :                               [01:23.45] je suis dans le noir
   - Une ligne avec un timestamp mais sans texte = pause instrumentale (♪).
   - Les balises [ti:], [ar:], [al:]... sont ignorées.
   - [offset:+200] décale toutes les paroles de 200 ms plus tôt.
   ⚠️ Dans les paroles, évite le caractère ` (backtick) et la séquence ${
      car ils ont un sens spécial dans une template string JavaScript.

   Astuce : si une cover ou un fichier audio est introuvable, le site ne
   plante pas — il affiche une cover de remplacement monochrome.
   ========================================================================== */

const TRACKS = [
  {
    id: "i-hate-being-in-love",
    title: "I HATE BEING IN LOVE",
    artist: "D-wrist",
    mood: "lipstick", // ambiance du lecteur : "lipstick" (sans = gris)
    cover: "covers/i-hate-being-in-love.jpg?v=2",
    audio: "audio/i-hate-being-in-love.wav",
    lyrics: `
[00:03.46](Huh, huh, huh yah)
[00:15.46](I hate being in love)
[00:19.18](I hate being in lo-ove)
[00:22.48](I hate being in love)
[00:28.81]Huh, huh, huh, yah
[00:32.32]Huh, huh, huh, yah
[00:36.08]Elle est marrante, elle grow on me
[00:37.83]Elle veut qu'on s'batte, elle est too horny
[00:39.76]J'suis son Clyde et c'est ma Bonnie, huh yah
[00:43.25]Huh, I hate being in love huh
[00:46.66]Huh, I hate being in love
[00:48.93]I hate being in love, I hate being in love huh (I hate being in love)
[00:54.23]I hate being in love huh
[00:56.35]Too many, too many guap que j'compte plus on me, j'regarde plus l'bank account
[00:59.87]Ta chérie elle grow on me, c'est plus ton amie, c'est plutôt ma main account
[01:03.32]Comment ça t'as pas les thunes ? T'as pas les racks ? T'as pas le cash en pounds ?
[01:06.90]Faut toujours viser la lune pour trouver sa place, moi j'me vois number 1
[01:10.18]Ma bitch, ma bitch (huh)
[01:12.18]Tous ces envieux voient les pics
[01:13.96]Tous ces envieux voient les pics
[01:15.27]Mais y'a que moi que ma baby elle kiss (bitch)
[01:17.53]Que moi qui goûte à ses lips (lips)
[01:19.24]Noir sur mes lèvres c'est son lipstick
[01:21.01]Noir dans son cœur c'est le risque
[01:22.82]J'me suis perdu dans son lipstick
[01:25.23]♪
[01:31.41](I hate being in love, I hate being in love huh)
[01:35.18]♪
[01:36.73](I hate being in love, I hate it)
[01:39.61]Huh, I hate being in love huh
[01:43.15]Huh, I hate being in love
[01:45.49]I hate being in love, I hate being in love huh (I hate being in love)
[01:50.77]I hate being in love huh
[01:52.82]Too many, too many guap que j'compte plus on me, j'regarde plus l'bank account
[01:56.36]Ta chérie elle grow on me, c'est plus ton amie, c'est plutôt ma main account
[01:59.87]Comment ça t'as pas les thunes ? T'as pas les racks ? T'as pas le cash en pounds ?
[02:03.40]Faut toujours viser la lune pour trouver sa place, moi j'me vois number 1
[02:06.92](Huh, huh)
[02:09.55](Moi j'me vois number 1, huh)
[02:13.66](Ma bitch, ma bitch)
[02:17.24](I hate being in love, I hate being in love, huh)
`
  },
  {
    id: "stage",
    title: "Stage",
    artist: "D-wrist",
    cover: "covers/stage.jpg",
    audio: "audio/stage.wav",
    lyrics: `
[00:16.80](Hein)
[00:21.76](Hein, hein)
[00:23.82]J'walk on the stage sur ta bitch qui... (Hein)
[00:26.40](Hein, hein)
[00:29.02]J'walk on the stage sur ta bitch qui crie
[00:31.08]Diamonds on me vas-y guess le prix
[00:32.87]J'ai pas gagné le trophée j'l'ai juste prix (hein)
[00:35.79]Masque au visage parce que mon coeur est juste gris (hein)
[00:39.23]Lui j'l'ai dans l'viseur parce que si il trahis on grrr
[00:41.61]J'a-
[00:42.29]J'a- j'arrive en (j'arrive en hein)
[00:43.81]J'arrive en big body
[00:45.99]100k en cash on me, j'm'allume un Kid Cudi
[00:48.61]J'ai la rage j'crois en moi depuis petit
[00:50.21]Démarrage 100k par mois c'est pas petit
[00:52.04]2k24, 17teudy, j'é- j'écoute J9ueve comme si c'est mon g (my g)
[00:55.94](Hein)
[00:56.86]J'perd pas le nord
[00:58.16]J'encaisse la nuit quand je dors
[00:59.85]J'trie les amis quand je sors (hein)
[01:01.54]Parce que pour une gadji ça peut t'tourner le dos (j'tourn-)
[01:04.05]J'troune pas ma veste sur mon bro (shoot)
[01:05.88]Shoot on a visé sa peau (shoot)
[01:07.61]Shoot et ça m'prends en photo (shoot)
[01:12.33](Hein)
[01:16.40](Hein)
[01:17.76]H&H hein
[01:21.24]H&h hein
[01:22.83]Heaven & Hell
`
  },
  {
    id: "babygirl",
    title: "Babygirl",
    artist: "D-wrist",
    cover: "covers/babygirl.jpg",
    audio: "audio/babygirl.wav",
    lyrics: `
[00:15.24](Yah)
[00:18.65](Yah)
[00:19.69](C'est ma baby on fait la paire)
[00:22.68](J'arrive en big body, en gros fer)
[00:24.26](C'est ma babygirl)
[00:25.94]C'est ma baby on fait la paire
[00:27.48]J'arrive en big body, en gros fer
[00:29.18]J'ai le calibre pour les faire taire (j'ai-j'ai)
[00:30.39]J'ai l'extendo pour les affaires (huh)
[00:32.76]J'ai pas finis (finis)
[00:33.56]Compter les fakes et les traitres j'ai pas finis (finis)
[00:35.05]Si tu nous la met on te fais, on te finis, on pah (pah)
[00:37.19]C'est un adieu infini
[00:38.30]Bitch (bitch)
[00:39.51]Tema le wrist
[00:40.73]Tout en diamand j'ai les keys
[00:42.64]Elle veut les kids (kids)
[00:43.86]Moi j'veux les racks à EsDeeKid
[00:45.78]Les paires à Lonely
[00:48.05]Il m'faut le liquide (-quide)
[00:49.36]Killcam et c'est moi le kill (kill)
[00:51.51]Et j'me rappelle (quand j'avais rien dans les-)
[00:53.09]Quand j'avais rien dans les poches
[00:54.69]Aujourd'hui c'est moi le boss (boss)
[00:56.28]Aujourd'hui c'est moi j'encaisse le cash quand ma chérie elle met le gloss (gloss)
[00:59.42]Verre de wine j'remplis son glass
[01:01.04]D-wrist le matin il bosse
[01:02.68]Puis j'm'endors avec une liasse (cash)
[01:05.11]Cache, bébé dis moi c'que tu cache
[01:07.91]Dis moi, est ce que tout est vrai
[01:09.04]Dis moi si ton coeur est prêt à la casse
[01:11.23]Pour elle j'sors le classe A
[01:12.83]Pour elle j'fais le cash (pour elle j'fais le cash)
[01:19.01](Bébé dis moi c'que tu cache)
[01:22.29](D-wrist le matin il bosse)
[01:25.46](Puis j'm'endors avec une liasse)
[01:29.95]C'est ma baby on fait la paire
[01:31.47]J'arrive en big body, en gros fer
[01:33.30]J'ai le calibre pour les faire taire (j'ai-j'ai)
[01:34.51]J'ai l'extendo pour les affaires (huh)
[01:36.79]J'ai pas finis (finis)
[01:37.53]Compter les fakes et les traitres j'ai pas finis (finis)
[01:39.04]Si tu nous la met on te fais, on te finis, on pah (pah)
[01:41.24]C'est un adieu infini
[01:42.28]Bitch (bitch)
[01:43.47]Tema le wrist
[01:44.62]Tout en diamand j'ai les keys
[01:46.57]Elle veut les kids (kids)
[01:47.83]Moi j'veux les racks à EsDeeKid
[01:49.79]Les paires à Lonely
[01:52.11]Il m'faut le liquide (-quide)
[01:53.49]Killcam et c'est moi le kill (kill)
[01:55.74]Des fakes et des traitres j'en ai connu
[01:57.45]Te coupent la main pour une commu (commu)
[01:59.10]Te considèrent en inconnu (inconnu)
[02:00.67]Alors que ils t'appelaient "frère" (frère)
[02:02.62]Il m'appelait frère
[02:04.29]Sont tous des fakes, pour eux je déballe et j'dégaine le fer
[02:06.94]Maintenant j'débarque en big body tout blanc
[02:09.41]Big racks c'est troublant
[02:11.07]Big chains en diamant
[02:12.28]Askip ta bitch veut un amant
[02:16.98](Yah, Yah)
[02:19.39]C'est ma babygirl
[02:22.56](C'est ma babygirl)
[02:24.36](Des fakes et des traitres j'en ai connu)
[02:27.48](J'arrive en big body en gros fer)
[02:32.33](C'est ma babygirl)
`
  },
  {
    id: "2024",
    title: "2024",
    artist: "D-wrist",
    cover: "covers/2024.jpg",
    audio: "audio/2024.wav",
    lyrics: `
[00:14.51](Huh, huh)
[00:17.88](Huh, huh)
[00:19.34](Ma bitch elle est-)
[00:21.37](Huh, huh)
[00:23.34](J'ai triché j'encaisse le bag-)
[00:25.15](Huh)
[00:27.50]J'ai triché j'encaisse le bag, même quand je dors
[00:30.98]Ma bitch elle a kiffé le bag, Christian Dior
[00:34.63]Elle veut qu'on s'en sorte, elle veut qu'on s'isole, qu'on fuck (huh, yah)
[00:40.41]J'veux le train de vie de Guy2 de (2)
[00:43.20]En 2k24 (quatre)
[00:44.64]Un fake et moi je l'écarte
[00:45.88]Lis mon destin, j'ai mélangé les cartes bitch (cartes)
[00:48.23]C'est moi je créer l'écart
[00:49.35]Sinon comment tu veux gagner (huh)
[00:51.43]Comment tu veux faire (huh, huh, yah)
[00:55.22]Ma bitch, ma bitch
[00:56.87]Black lipstick sinon c'est pas ma bitch (bitch huh)
[00:58.49]Elle c'est une OG s'en fou qu'je sois rich (huh)
[01:01.93]Emoji peach (peach)
[01:03.24]Bad bitch j'l'emmène à Beijing (Beijing)
[01:04.92]J'suis déjà au bout de la piste (piste)
[01:06.59]Bitch on t'pisse dessus (huh)
[01:08.26]Si tu crois qu'on est pas au dessus (huh)
[01:09.96]Allongé là j'ai la vue (allongé là j'ai la vue)
[01:11.22]Sur toute la ville la main sur son cavu (sur toute la ville la main sur son cavu)
[01:16.04]Et moi j'ai jamais trahis hein
[01:17.74]Ça te coupe la main pour un rien
[01:22.22](Huh, huh)
[01:25.64](Huh, huh)
[01:29.60](Et moi j'ai jamais trahis hein)
[01:31.22](Ça te coupe la main pour un rien)
[01:35.70]J'veux le train de vie de Guy2 de (2)
[01:37.41]En 2k24 (quatre)
[01:38.74]Un fake et moi je l'écarte
[01:40.01]Lis mon destin, j'ai mélangé les cartes bitch (cartes)
[01:42.39]C'est moi je créer l'écart
[01:43.38]Sinon comment tu veux gagner (huh)
[01:45.43]Comment tu veux faire (huh, huh, yah)
`
  }

  /* ---- MODÈLE À COPIER-COLLER (retire les deux lignes de tirets) ------
  ,{
    id: "mon-morceau",
    title: "Mon Morceau",
    artist: "D-wrist",
    cover: "covers/mon-morceau.jpg",
    audio: "audio/mon-morceau.mp3",
    lyrics: `
[00:00.00]
[00:05.00]Première ligne
[00:08.50]Deuxième ligne
`
  }
  ------------------------------------------------------------------------ */
];
