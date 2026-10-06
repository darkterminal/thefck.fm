---
title: "Notes on Plain Text"
description: "Why I keep almost everything I write in files that any editor can open."
date: "2026-10-05"
author: "Your Name"
tags:
  - writing
  - technology
published: true
---

# Notes on Plain Text

Most of what I have written in the last ten years lives in plain text files. Not because I dislike fancy tools, but because the files outlast the tools.

## What I get from it

A Markdown file is readable the moment it is opened. There is no export step, no account, and no moment where a company decides my notes now belong to a plan I have to pay for.

- Files open in any editor, on any machine.
- Version control gives me a complete history for free.
- Search is just `grep`, and it is fast.

> A note you cannot open in five years is not a note. It is a liability.

## A small example

Every post on this site starts as a file with a short header, followed by the text:

```yaml
---
title: "Notes on Plain Text"
date: "2026-10-05"
tags:
  - writing
---
```

The site reads the file, turns the Markdown into HTML in the browser and shows it. That is the whole system. Here is the same idea as code:

```js
const text = await fetch("content/posts/my-post.md").then((r) => r.text());
console.log(text.length, "characters");
```

## What it costs

Plain text is not free. You give up some things, and it is worth being honest about which.

| You give up | You get |
| --- | --- |
| Drag-and-drop layout | Text that never breaks |
| Built-in collaboration | Files you can diff and review |
| Fancy embeds | Pages that load instantly |

The cover art for the first podcast episode shows how little you need: ![A black square with a white number one](../../podcast/covers/episode-001.svg)

If you want to start, open an empty file, write one paragraph and save it as `first-note.md`. Read more about the format on [the Markdown guide](https://www.markdownguide.org/).
