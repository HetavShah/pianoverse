---
name: Pianoverse
description: A desktop studio for turning one recorded piano take into a visualizer video, set like a musica viva concert poster.
colors:
  live-vermilion: "#e9542d"
  live-vermilion-hover: "#f2683f"
  live-soft: "rgba(233, 84, 45, 0.1)"
  poster-black: "#161615"
  raise: "#1f1e1c"
  raise-2: "#292825"
  stage: "#0c0c0b"
  paper: "#f2efe8"
  stone: "#a29f98"
  dim: "#8a8781"
  rule: "#2b2a27"
  rule-2: "#3a3834"
  section-bone: "#c9c4b8"
  ok: "#6f9e7c"
  warn: "#d9a441"
  bad: "#f0607a"
typography:
  display:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "clamp(56px, 7vw, 104px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.04em"
    textTransform: "uppercase"
  timecode:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.02em"
    textTransform: "uppercase"
  inspector-title:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
    textTransform: "uppercase"
  readout:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
  room:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  layer-number:
    fontFamily: "Syncopate, 'Archivo Variable', sans-serif"
    fontSize: "18px"
    fontWeight: 700
  title:
    fontFamily: "'Archivo Variable', Archivo, 'Segoe UI', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Archivo Variable', Archivo, 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "'Archivo Variable', Archivo, 'Segoe UI', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
  label:
    fontFamily: "'Archivo Variable', Archivo, 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  caption:
    fontFamily: "'Archivo Variable', Archivo, 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    fontFeature: "'tnum' 1"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "24px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.live-vermilion}"
    textColor: "{colors.poster-black}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.live-vermilion-hover}"
    textColor: "{colors.poster-black}"
  button-primary-disabled:
    backgroundColor: "{colors.raise-2}"
    textColor: "{colors.dim}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0 2px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.stone}"
    rounded: "{rounded.none}"
    height: "36px"
  button-play:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.poster-black}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0 16px 0 13px"
    height: "36px"
  input-text:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 2px"
    height: "36px"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.stone}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "32px"
  segment-on:
    textColor: "{colors.paper}"
  popover:
    backgroundColor: "{colors.raise}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "6px 0"
    width: "290px"
  toast:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.poster-black}"
    rounded: "{rounded.none}"
    padding: "10px 14px 10px 16px"
  layer-row:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "40px"
---

# Design System: Pianoverse

## Overview

**Creative North Star: "The Musica Viva Poster"**

The studio is set like a Müller-Brockmann concert poster for the Tonhalle: a warm poster-black ground, paper-white ink, a strict ruled grid of hairlines, a wide display face set in capitals against a plain grotesk at two far-apart scales, and a single vermilion reserved for whatever is live right now. The take itself is drawn as rhythm: the score band along the bottom of the studio is the poster's figure, and everything else is the ruled sheet it is printed on.

Density is that of a working tool, not a dashboard. Regions are separated by 1px rules, never by cards, fills or shadows. Controls are text sitting on rules; values are read as big Syncopate numerals; the colour in the frame belongs to the user's video, so the chrome stays black, paper and stone. The visual rejections are confirmed by the build and the direction: no SaaS carded panels, no pill segments, no neon accent on blue-black, no glow, gradient or glass gloss on chrome.

**Key Characteristics:**
- Warm neutral blacks (never blue) with paper-white ink and stone secondary text.
- Hairline rules (1px) do all the structural work; nothing is rounded.
- Two families: Syncopate (wide, set in capitals) for titles, rooms and the big numerals; Archivo Variable for everything you read.
- Vermilion appears only on the one live thing per region.
- The score band (notes on bar and beat hairlines, the vermilion playhead) is the signature.

## Colors

A monochrome poster palette of warm blacks, paper and stone, punctured by one vermilion and three quiet status colours.

### Primary
- **Live Vermilion** (live-vermilion): the one live thing. The playhead, the current room's underline, the current layer's name and number, selection underlines in segmented choices and choice cards, and the primary action block. Also the focus ring, text caret and text selection. Its hover step (live-vermilion-hover) applies only to the primary button. The translucent wash (live-soft) is reserved for live regions on canvases.

### Neutral
- **Poster Black** (poster-black): the app ground, the top band, the inspector and the score band. Doubles as ink on paper and vermilion fills.
- **Raise** (raise): popovers, menus, modals and the hover wash on list rows.
- **Raise Two** (raise-2): hover fill inside menus, the disabled primary fill.
- **Stage** (stage): the darker well behind the video preview, thumbnails and canvases, so the user's footage sits in its own space.
- **Paper** (paper): primary text, the Play block, toasts, checked boxes, slider thumbs, toggles' on state, loop bounds and secondary selection outlines.
- **Stone** (stone): secondary text, labels, inactive tabs, ghost buttons.
- **Dim** (dim): tertiary numerals (layer and step numbers), disabled text, the hover state of hairlines.
- **Rule** (rule): the 1px hairline between every region and every ruled row.
- **Rule Two** (rule-2): the underline under text buttons and inputs, popover borders, slider tracks, the stronger bar line in the score.
- **Section Bone** (section-bone): shape sections in the score band and the close-shot block in the camera lane.

### Status
- **Ok** (ok), **Warn** (warn), **Bad** (bad): tracking quality, step ticks, warnings and errors only. They appear as small square marks, text colour or a 2px top rule, never as filled panels.

### Named Rules
**The One Live Thing Rule.** Vermilion is only for the playhead, the current room, the current layer, selection underlines and the primary action. Loop bounds, toggles' on state and secondary selection outlines use paper or stone. If two vermilion things compete in one region, one of them is wrong.

**The Video Owns Colour Rule.** Chrome stays black, paper and stone. Hue in the window belongs to the user's take: note bars carry the look's own palette, and colour pickers may show full-spectrum tracks because they depict the user's colours, not the app's.

## Typography

**Display Font:** Syncopate (400 and 700), self-hosted. Wide letterforms, always in capitals for words; numerals at 400.
**Body Font:** Archivo Variable (with Archivo, Segoe UI, system-ui), self-hosted with the width axis.

**Character:** A poster headline face against a working grotesk. Syncopate carries the titles, the rooms, the layer numbers and every big changing number; Archivo carries labels, help, buttons and body text at 11 to 17px.

### Hierarchy
- **Display** (Syncopate 700, 56 to 104px, capitals): the Projects home title only.
- **Headline** (Syncopate 700, 32px, capitals): setup page titles (Import your performance, Notes and sync, Calibrate keyboard, Export video).
- **Inspector Title** (Syncopate 700, 24px, capitals): the selected layer's name in the Style inspector and the Camera panel; shot cards and modal titles follow it.
- **Timecode** (Syncopate 400, 34px, tabular): the playhead time at the head of the score band.
- **Readout** (Syncopate 400, 18px): one value per dial in the inspector; stat numbers on Notes at 26px.
- **Room** (Syncopate 700, 13px, capitals, 0.08em tracking): Style, Camera, Export in the top band.
- **Layer number** (Syncopate 700, 18px): 01 to 08 in the layer rail.
- **Title** (Archivo 700, 17px): section headings; the wordmark is Archivo 700 at 14px in capitals with 0.12em tracking.
- **Body** (Archivo 400, 14px, 1.4): default text; help text runs at 12.5px, 1.55, max 62ch in stone.
- **Control** (Archivo 600, 13.5px): buttons, menu items, segmented choices.
- **Label** (Archivo 600, 12px, sentence case, stone): section labels above control groups.
- **Caption** (Archivo 600, 11px, tabular): step numbers, ruler ticks.

### Named Rules
**The Two Faces Rule.** Syncopate is for things you glance at (titles, rooms, numbers); Archivo is for things you read. Words in Syncopate are always capitals; sentences are never set in Syncopate. Every changing number is tabular.

## Layout

A ruled poster grid sized for a desktop window. The top band is 56px with the wordmark, the setup trail and, after a 1px rule, the rooms. Setup pages use a main column plus a 360px side column split by a hairline, with a ruled foot holding the next action. The Style room is three columns (240px layers, flexible stage, 340px inspector), with the score band spanning the bottom: a 240px transport column then the timeline. Below 1280px wide the columns tighten to 210px and 310px.

Spacing is set in 4px steps; control rows sit 12px apart inside ruled sections padded 14px above and 16px below, region gutters are 20 to 24px, and page gutters 40 to 56px. Rows are separated by a top rule rather than by gaps or boxes.

**The Ruled Sheet Rule.** Structure is a 1px rule in rule colour. A new region gets a hairline, not a card, a fill change or a border box.

## Elevation & Depth

The system is flat. There are no drop shadows, glows, gradients or glass on chrome. Depth is conveyed by tone: stage is darker than ground for the video well, and raise is lighter than ground for anything floating above it. Popovers, menus and modals are a raise fill with a 1px rule-2 border. The modal backdrop dims the window to near-black at 70 percent.

Inset box-shadows appear in the code, but only as rules: a 1px or 2px line under buttons and selected tabs. They are drawing devices, not elevation.

**The Printed Flat Rule.** Nothing on chrome casts a shadow. A floating surface is raise plus a rule-2 border; that is all.

## Shapes

Every corner is square (0px). Lines are hairlines at 1px, with 2px reserved for selection and status rules and 3px for the current room. Small square marks (6 to 10px) stand in for dots in legends, check marks and lists. The only circles are functional: the spinner, the colour wheel and the glide transition marker in the camera lane.

## Components

### Buttons
Text on a rule. A button is its label with a 1px rule underneath; the rule turns paper on hover.
- **Shape:** square (0px), 36px tall; small 30px, big 44px.
- **Primary:** the only filled block in vermilion, poster-black text at 700, 16px side padding. Hover lifts to the lighter vermilion. Disabled primary uses the neutral raise-2 fill with dim text, never a faded vermilion.
- **Play:** a paper block with poster-black text and an authored SVG glyph; the second and last filled button.
- **Ghost and icon:** no rule, stone text, paper on hover.
- **On (toggled):** paper text with a 2px paper underline. Toggles never turn vermilion.
- **Focus:** a 2px vermilion outline offset 2px.

### Segmented Choices
- **Style:** a row of bare text labels in stone, 32px tall, 4px apart, no container.
- **State:** the chosen one goes paper, 700 weight, with a 2px vermilion underline. Choice cards (size, mode) use the same logic on a 2px top rule: rule-2 at rest, dim on hover, vermilion when chosen.

### Inputs / Fields
- **Style:** transparent, a 1px rule-2 bottom line only, square, 36px tall, tabular numerals.
- **Focus:** the bottom line turns paper; keyboard focus adds the vermilion ring.
- **Disabled:** 45 percent opacity.
- **Sliders:** a 2px rule-2 track with a 5 by 18px paper bar thumb. Checkboxes are 16px squares with a stone border, filled paper with a poster-black tick when checked.

### Popovers, Menus and Modals
Raise fill, 1px rule-2 border, square, no shadow. Menu rows are 13.5px paper text, raise-2 on hover, with ruled head and foot.

### Toasts
A paper block with poster-black text at the bottom centre; errors use the bad fill. They slide up 8px on entry.

### Navigation
- **Wordmark:** 17px, 800, paper.
- **Setup trail:** 13px stone labels with 11px dim tabular step numbers and an authored SVG tick in ok green for done steps. The current step goes paper with a 2px vermilion underline and a vermilion number.
- **Rooms:** 13px Syncopate 700 in capitals, separated from the trail by a hairline; the current room carries a 3px vermilion underline that eases in.

### Layer List
Numbered rows (01 to 08) at 16px, 40px tall. The current layer's name and number turn vermilion and the name goes 700; hidden layers fall to dim; hover is a raise wash.

### Score Band (signature)
The take drawn as poster rhythm across the bottom of the studio.
- **Transport:** the 64px light timecode, its duration in 12.5px stone, then the paper Play block and stone icon buttons.
- **Grid:** a 1px hairline on every beat and a stronger rule-2 line on every bar; a 11px tabular ruler on top.
- **Notes:** each bar in the look's own colour, its thickness (3 to 6px) and alpha (0.5 to 1) set by velocity so the band reads as dynamics, not just pitch.
- **Lanes:** the tracking-quality lane collapses to nothing when there is no tracking; the particles lane shows section-bone blocks with paper for the selected one.
- **Selection:** loop bounds are stone handles over a 7 percent paper wash.
- **Playhead:** a 2px vermilion line with a 10 by 5px vermilion cap, the only vermilion in the band apart from the selected section's edges.

### Icons
Authored inline SVG at 11 to 18px in currentColor, stroked about 1.6 to 1.8. Never unicode glyphs.

## Do's and Don'ts

### Do:
- **Do** keep vermilion (#e9542d) to the playhead, the current room, the current layer, selection underlines and the primary action.
- **Do** draw buttons as text with a 1px rule underneath; only the primary (vermilion) and Play (paper) are filled blocks.
- **Do** give a disabled primary the neutral raise-2 fill with dim text.
- **Do** separate regions and rows with 1px hairlines in rule colour.
- **Do** set changing numbers in Syncopate, tabular (34px timecode, 18px readouts), against 11 to 14px Archivo UI text.
- **Do** float popovers as a raise fill with a 1px rule-2 border.
- **Do** collapse score-band lanes that carry no data.
- **Do** author icons as inline SVG in currentColor.

### Don't:
- **Don't** put shadows, glows, gradients or glass on chrome.
- **Don't** use vermilion for loop bounds, toggles' on state or secondary selection outlines; use paper or stone.
- **Don't** round corners or wrap groups in cards and bordered boxes.
- **Don't** use pill segments or filled tabs; selection is weight plus an underline.
- **Don't** let the ground drift blue; the blacks stay warm.
- **Don't** use unicode glyphs as icons.
