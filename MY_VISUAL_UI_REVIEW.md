# Visual UI review

There are a number of bugs that I see visually, ranging from UI styling to buttons error. Let me list them as many as I can, categorizing them by page.

**Note:** that there are certainly more bugs I haven't discovered. These are just guilds so you can dig in a lot more. Feel free to discard, critique, discuss with me if the issue are not clear or should be discarded.

## Landing page (http://localhost:5173/)

| Issue                                           | Fixing explanation ID | Priority |
| ----------------------------------------------- | --------------------- | -------- |
| Background grid is very pale. I cannot see them | 1                     | LOW      |

## Play localy page (http://localhost:5173/#local)

| Issue                                                                                                                                 | Fixing explanation ID | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| Game mode panel is overlaping the map game screen (image: my_screenshots/play_local_page_01.png)                                      | 2                     | HIGH     |
| The edge of the map canvas that is scaled down before match starts looks bad because the padding is not equal on the width and height | 2                     | HIGH     |

## Play online page (http://localhost:5173/#online)

| Issue                                                                                                          | Fixing explanation ID | Priority |
| -------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| Enter name is not possible with participant joining the game with URL instead of manually typing the room code | 3                     | HIGH     |
| Enter name should not be on this page because of the issue above                                               | 3                     | HIGH     |
| This page shouldn't exist in the first place                                                                   | 3                     | MEDIUM   |

## Online room page (pre-game) (http://localhost:5173/#room=XXXX)

| Issue                                                                 | Fixing explanation ID | Priority |
| --------------------------------------------------------------------- | --------------------- | -------- |
| Start match button in ON the arena settings, which can be hidden      | 3                     | HIGH     |
| Name tag is not as visible. I don't even know how it supposed to work | 4                     | MEDIUM   |
| Switching sides doesn't work                                          | 5                     | MEDIUM   |
| Reroll terrain works but players position doesn't change              | 6                     | MEDIUM   |

## Online room page (in-game) (http://localhost:5173/#room=XXXX)

| Issue          | Fixing explanation ID | Priority |
| -------------- | --------------------- | -------- |
| Lob-sided UI   | 7                     | HIGH     |
| Unclear status | 4, 7                  | HIGH     |

## Fixing explanation

This is just a guild so that you can refine if it fits the architecture.

1. ### Lighten them up
   - Bump the opacity up
2. ### Redesgn the pre-game UI for both Online and Local
   - Style: Grid, Round corners, Flex box
   - There are two main components in the pre-game UI; footer, game settings, game map.
   - Footer sits on the bottom. The current header should be removed from online page. This span from the left all the way to the right:
     |---------------------------------------------------------------------------------------------------------------|
     | [Start Button] [Name input (for online)] [Switch color (for online)] [Room name copy + Link copy (for online)]|
     |---------------------------------------------------------------------------------------------------------------|
   - Arena settings can be similar to what we have now, but the online settings and local settings panel should look identical. It should be opened/closed with a floating button on the top right, which will stay on the page at all time. The keep the layout as is for now, but the bottom of the component should be over the footer.
   - Map has some serious changes.
     - The map currently renders the grids line up to the point where the map size is set to. I want to render all the way to the edge of the screen, no matter how tall or wide the screen is on a particular device.
     - How should the bullet hit the boundary if the map is rendered differently on different devices? The answer is, we are gonna draw boundary lines (a simple rectangle) explicitly on the map (I'll style it later).
     - How should the map transitions between the pre-game and game state? It will now be fixed in place for now untill everything is stable.
     - The map will be pushed to a smaller width (height is the same) when the arena settings is opened.
3. ### Remove online page
   - We should make play online options show right after the player clicks the play online button the landing screen. The options or create room or join a room should then be showed as a new component under the 2 buttons on the landing page in a closed box or something like that.
4. ### Name tag remake
   - Every players get their names right on the soldier dot as a badge. This is bigger in pre-game and smaller in game stage. The badges are not count as their hit boxes.
   - When a player joins, their soldier dot should appear on the map.
5. ### Sides changing mechanics
   - Players should be able to change side, even if the side they are moving from is gonna be emptly, because some may prefer to write equations from the other perspective.
   - The button should be in the footer as stated in point 2.
6. ### Rerool mechanism
   - The reroll should also reroll the player position. From the point 5, when player changes side, the terrain need to be rerolled to accomodate the new layout. For example (0v2) happens when people switches sides of one another.
   - Essentially, every changes needs a reroll.
7. ### In-game UI
   - From the point 2, everything in the in-game is pretty much the same layout, but with arena settings removed.
     - The input (both local and online) should be in the footer as well.
     - The rounds status should now be on top center (not a bar, just on its own)
     - In HP mode, the name badge should also include the HP of that player

## Things I don't know if they exist:

- After match summary; kill count per person, MVP, leaderboard. (Shouldn't be made now in MVP)
