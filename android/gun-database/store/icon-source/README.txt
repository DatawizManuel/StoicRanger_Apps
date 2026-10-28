STOIC RANGER - ANDROID APP ICON
Based on logo A, white on black.

StoicRanger_Android-App-Icon_PREVIEW.png      Preview of the icon in common launcher shapes and sizes
StoicRanger_Android-App-Icon_Play-Store_512px.png   Google Play listing icon (512 x 512, full square, Google rounds the corners)
StoicRanger_Android-App-Icon_full.svg         Master vector of the full icon

Adaptive icon (Android 8+), 108 x 108 dp layers. The emblem stays inside the 66 dp safe zone,
so no launcher mask cuts into it:
  ..._adaptive-foreground.svg   white emblem, transparent
  ..._adaptive-background.svg   solid black
  ..._adaptive-monochrome.svg   single-color layer for themed icons (Android 13+)

mipmap-*/   Ready-made PNGs for an Android Studio project (res/ folder):
  ic_launcher.png, ic_launcher_round.png         legacy icons, 48 to 192 px
  ic_launcher_foreground/background/monochrome   adaptive layers, 108 to 432 px
