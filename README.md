# Gojo contre Sukuna

Jeu mobile d'action sandbox en pixel art isométrique, inspiré de Jujutsu Kaisen. Il se joue dans le navigateur (Android et iOS), **uniquement en paysage**.

Choisis Gojo Satoru ou Ryomen Sukuna et un point d'apparition, puis affronte les fléaux dans une grande ville destructible de cinq quartiers. Il n'y a pas de mission : le chaos monte avec le temps, la destruction et les fléaux éliminés.

## Jouer

- Ouvre la page GitHub Pages du dépôt sur ton téléphone, tenu à l'horizontale.
- **Conseillé :** ajoute le jeu à l'écran d'accueil pour le vrai plein écran.
  - iPhone : Safari, bouton Partager, puis « Sur l'écran d'accueil ».
  - Android : Chrome, menu ⋮, puis « Ajouter à l'écran d'accueil ».

## Commandes

| Commande | Action |
|---|---|
| Joystick (moitié gauche de l'écran) | Se déplacer et viser |
| 攻 | Combo de 4 coups (maintenir pour enchaîner) |
| DASH / ESQ. | Dash (téléportation pour Gojo) et esquive |
| 4 boutons de techniques | Une recharge propre à chaque pouvoir |

Les boutons se déplacent et se redimensionnent dans **Paramètres > Commandes tactiles**. La disposition et les réglages sont conservés.

Sur ordinateur, pour les tests : ZQSD/WASD pour bouger, J pour attaquer, K pour le dash, L pour l'esquive, U I O P pour les techniques, Échap pour la pause.

## Personnages

- **Gojo Satoru :**
  - Infini (passif) ;
  - Bleu : attire ennemis et véhicules ;
  - Rouge : tir explosif si tu vises, onde de choc autour de toi si le joystick est relâché ;
  - Violet : tir dévastateur ;
  - Extension du territoire : Unlimited Void.
- **Ryomen Sukuna :**
  - Démantèlement : taillades à distance ;
  - Clivage : coup puissant à courte portée ;
  - Flèche de feu ;
  - Extension du territoire : Malevolent Shrine.

## Technique

- Phaser 3 (inclus dans `vendor/`), JavaScript pur, aucune étape de compilation.
- Tout le pixel art est généré par le code au lancement.
- Les sons et la musique sont synthétisés. Pour utiliser tes propres musiques, dépose `music_menu.mp3` et `music_game.mp3` dans `audio/` : elles remplacent automatiquement la musique synthétisée.

```
index.html, style.css      page et interface
src/main.js                démarrage, taille d'écran
src/scene.js               boucle de jeu, caméra, sessions
src/world/                 génération de la ville, sol, bâtiments et objets destructibles
src/game/                  joueur et techniques, fléaux, combat, chaos, extensions, effets
src/gfx/                   génération du pixel art
src/ui/                    menus, HUD, mini-carte, commandes tactiles
```

Pour tester en local, ouvre le dossier avec un petit serveur web (les modules JavaScript ne se chargent pas en `file://`). Le paramètre `?test=gojo` ou `?test=sukuna` lance un scénario automatique.
