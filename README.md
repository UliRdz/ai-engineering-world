AI Engineering World
A small web app to learn AI engineering concepts while playing a simple Python coding game.
What it does

You solve short Python puzzles (like a mini game).
Each solved puzzle unlocks a new set of AI/ML concepts.
Everything runs directly in your browser — no installation needed.

Project structure

index.html- main page
css/-styles
js/-app logic, puzzles, and content
py/-Python code used in the game
assets/-extra content

How to run
Online (recommended):

Upload this project to GitHub
Enable GitHub Pages
Open the provided link

Locally:
Shellcd ai-engineering-worldpython -m http.server 8000Afficher plus de lignes
Then open:
http://localhost:8000
Notes

Uses Python in the browser (via Brython)
No backend or build step required
Works as a static site

Customize

Edit AI concepts in: js/encyclopedia-data.js
Edit puzzles in: js/karel-engine.js
