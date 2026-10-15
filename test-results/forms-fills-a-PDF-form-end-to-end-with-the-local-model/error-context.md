# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forms.test.ts >> fills a PDF form end to end with the local model
- Location: e2e/forms.test.ts:28:1

# Error details

```
Error: Channel closed
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Check every value')
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Check every value') with timeout 3600000ms
  - waiting for getByText('Check every value')
  - Target page, context or browser has been closed

```

```yaml
- navigation "Main":
  - text: Offee
  - link "Chat":
    - /url: /chat
    - img
    - text: Chat
  - link "Reply":
    - /url: /reply
    - img
    - text: Reply
  - link "Translate":
    - /url: /translate
    - img
    - text: Translate
  - link "Review":
    - /url: /review
    - img
    - text: Review
  - link "Forms":
    - /url: /forms
    - img
    - text: Forms
  - link "Library":
    - /url: /library
    - img
    - text: Library
  - link "Profiles":
    - /url: /profiles
    - img
    - text: Profiles
  - link "Personas":
    - /url: /personas
    - img
    - text: Personas
  - link "Run log":
    - /url: /runs
    - img
    - text: Run log
  - link "Stored data":
    - /url: /data
    - img
    - text: Stored data
  - img
  - text: "Sealed (no gateway) Model: ggml-org/gemma-4-E4B-it-GGUF Transcription starting…"
- banner:
  - heading "Fill and sign a form" [level=1]
- main:
  - text: For
  - combobox "Profile": End to end (fictional)
  - text: as
  - combobox "Persona": Default assistant
  - img
  - paragraph: "The AI that reads the form and suggests values runs on this machine, not in the cloud, so it takes a while: reading a form takes usually 30 s to 3 min, then saving it filled or signed takes usually 2 s to 15 s. You can use the rest of Offee meanwhile; the indicator at the top shows what runs and stops it."
  - button "Open a PDF form":
    - img
    - text: Open a PDF form
  - button "Try the sample form":
    - img
    - text: Try the sample form
  - button "View it":
    - img
    - text: View it
  - img
  - paragraph: fetch failed
```

```
Error: apiRequestContext._wrapApiCall: Target page, context or browser has been closed
```