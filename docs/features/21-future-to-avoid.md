# 21. The future to avoid

**Goal:** a vision can carry its other side: where things would be in a few years if they were
left to slide. Seeing the wished-for picture next to the unwanted one is what gives the first
its pull.

Read `README.md` first (decision 8).

## What the user sees

### In the vision form

Under "What does it look like?" a second, optional field:

> **If I let this slide**
> Where would you be in three to five years if you did nothing about this? Write it plainly, as
> it would really be.

### On the vision card

Folded away by default, so the Visions view stays a page about what is wanted:

```
 To be fit and live healthily
 I run without getting out of breath and have energy for the children in the evening.
 ▸ If I let it slide
```

Opening the fold shows the text. The fold's state is not remembered.

### Elsewhere

- In the monthly and yearly review (14), beside each vision, already open.
- In the discovery exercise "A good ordinary day" (01), whose last step asks for it.
- Nowhere else. Not on the Map, not on Today, not in toasts, not in tips.

## Rules

- Stored on the vision: `avoid`, a string, trimmed; absent when empty. `normalizeVisions` keeps
  a string and drops anything else.
- At most 2,000 characters.
- It is text and nothing more. It never creates a goal, is never counted, and nothing is
  measured against it.
- Visions merge as whole items (the newer copy wins), so it needs no merge of its own.
- The context menu of a vision gets **Add what to avoid** when the field is empty, opening the
  form with the field focused.

## Strings

| Key | English |
|---|---|
| `f.visionAvoid` | If I let this slide |
| `f.visionAvoidPh` | Where would you be in three to five years if you did nothing about this? Write it plainly, as it would really be. |
| `vis.avoid` | If I let it slide |
| `ctx.addAvoid` | Add what to avoid |

## Guidance

- Guide, article `vision-how`, new paragraph after "Signs that a vision is really yours":
  "It can help to write the other side too: where you would be in a few years if you let this
  slide. The vision form has a field for it. Keep it honest and short, and keep it where it is:
  goals work better when they say what you are moving toward, so set them from the vision, not
  from the fear."
- Guide, article `h-visions`: one sentence naming the field and the fold.
- No tip.

## Notes for the builder

1. Goals framed as avoiding something go with lower well-being than goals framed as reaching
   something (`docs/guidance/findings.md`, finding 19). That is why this text stays on the
   vision, folded, and is never turned into a goal or shown at the moment of action. Do not
   add "make a goal from this".
2. The fold is a `<details>` element or a button with `aria-expanded`, like the Guide's
   articles.

## Test cases

- Unit: `normalizeVisions` keeps a string `avoid`, drops a number; merge keeps the newer
  vision's text.
- Page: the field saves and shows folded on the card; an empty field shows no fold; the context
  menu entry appears only when it is empty and focuses the field.
- Edge: 2,000 characters accepted, more refused; text with markup shown as typed; line breaks
  kept; phone width wraps; both languages.
- Fixture: a visions store with `avoid`.
