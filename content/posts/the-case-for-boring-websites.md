---
title: "The Case for Boring Websites"
description: "A page that loads in a blink, reads well and still works in ten years is not a small ambition."
date: "2026-09-21"
author: "Your Name"
tags: [technology, web]
published: true
---

I want my website to be boring in the best possible way. It should load before I finish blinking, read well on a phone, and behave the same way next year.

## Three rules

1. Ship less. Every kilobyte is a request somebody has to wait for.
2. Use the platform. Links, buttons and forms already work.
3. Keep the content separate from the code, so either can change on its own.

## What "boring" looks like in practice

A boring site has a handful of HTML files, one stylesheet and a few small scripts. There is no build pipeline to babysit. When something breaks, there are very few places it can break.

Typography does most of the work. A strong headline, a comfortable measure of about seventy characters per line and generous space around the text beat any amount of decoration.

### Where I still compromise

I load Markdown rendering from a CDN, only on pages that need it. It is a trade-off: one extra request in exchange for not writing a parser I would have to maintain.

> Boring is not the absence of taste. It is taste with the ornament removed.

Try this: open your own site, disable JavaScript, and see what is left. Whatever remains is your real website.
