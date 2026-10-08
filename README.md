# Offee

An office assistant that runs on your own machine without being able to touch it. It keeps
the profiles you act as, the personas that do the work and the documents each may use, and
runs everyday office work on local models: filling and signing forms, writing reviews from
notes or recorded talks, translating, and drafting replies to emails and chats.

Nothing leaves the machine unless you open the switch, and the app cannot open it itself.

## Concepts

- **Profile:** an identity you act as. Name, role, contact details used in forms, signature
  image and signing certificate, languages, tone. One person usually keeps several (personal,
  employee, company director), so there are no accounts: one unlock opens them all.
- **Persona:** an assistant role, such as "contract reviewer" or "support replier". It holds
  instructions, the model to use, the tools it may call and whether it may use a remote model.
- **Knowledge:** documents assigned to a profile or a persona, indexed so answers can cite
  them.
- **Workflow:** a template, written as data, with its inputs, steps, persona and output.
- **Run:** the record of one workflow run: inputs, model, anything that left the machine, and
  the output.

## Workflows

| Workflow            | In                                        | Out                                   |
| ------------------- | ----------------------------------------- | ------------------------------------- |
| Fill and sign       | a PDF form and a profile                  | the filled PDF, signed                |
| Review              | notes, text, or a recording of a talk     | a structured review, DOCX or PDF      |
| Translate           | a document and a target language          | the document translated, layout kept  |
| Draft a reply       | an email (`.eml`, `.mbox`) or chat thread | a reply grounded in your knowledge    |

## Isolation

```
 host (macOS / Linux)                       VM (Colima)
┌──────────────────────────┐   ┌──────────────────────────────────────────┐
│ launcher                 │   │  app container        no network,        │
│  - start / stop the VM   │   │  (UI, API, data)      no host folders    │
│  - unlock the volume     │   │        │ internal network only           │
│  - the switch: sealed /  │──►│  gateway container ── the only way out,  │
│    ask / open for N min  │   │        │              closed by default  │
│  - approval prompts      │   │  inference container  llama.cpp,         │
│ browser ── 127.0.0.1 ────┼──►│  (GPU via krunkit)    whisper.cpp        │
└──────────────────────────┘   └──────────────────────────────────────────┘
```

- **The VM is the wall.** Colima runs one Linux VM, configured with no shared folders. The
  app's data lives on an encrypted volume inside it.
- **Files come and go through the browser.** You upload what the app may read and download
  what it produces. It never reads a host path.
- **The app container has no network.** It reaches only the inference and gateway containers
  on an internal network.
- **The gateway is the only way out.** It forwards to listed hosts only, adds API keys itself,
  and obeys the switch:
  - **Sealed:** nothing leaves.
  - **Ask:** each request waits for your approval and shows exactly what would be sent.
  - **Open for N minutes:** closes again on its own.
- **Only the host launcher holds the switch.** It controls the gateway through the VM's
  container socket, which the app container never gets, so a hostile document cannot open it.
- **Documents are untrusted.** Whatever a document says, a persona keeps the tools its
  definition gives it, and the closed gateway means nothing can be smuggled out.

## Models

- **Local, the default:** llama.cpp serves the chat model, embeddings and reranker;
  whisper.cpp transcribes; Tesseract reads scans. On Apple Silicon the GPU reaches the VM
  through Colima's `krunkit` VM type.
- **Remote, only through the switch:** Claude and other providers, per persona.
- **Updates without a network:** models ship as signed bundles, verified offline and imported
  through the browser. A manifest pins each by name, hash and licence.

## Platforms

macOS on Apple Silicon first, then Linux. Windows (WSL2) later.

## Prior art

Nothing found does all of this; these do parts of it and are reused or copied where they fit.

- **Personas with documents:** [Open WebUI](https://docs.openwebui.com/features/workspace/models)
  custom models, [AnythingLLM](https://anythingllm.com/desktop),
  [Msty](https://docs.msty.studio/knowledge-stacks/overview). None isolates itself.
- **Office suite with local AI:** [Nextcloud Hub](https://docs.nextcloud.com/server/stable/admin_manual/ai/app_llm2.html).
  Heavy, and no documented offline install.
- **Agent sandboxes:** [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/security/)
  (the gateway adding API keys itself is copied from their proxy),
  [Beachead](https://awesome.ecosyste.ms/projects/github.com%2Fbeachead-dev%2Fbeachead),
  [microsandbox](https://github.com/superradcompany/microsandbox).
- **Engines:** [Stirling-PDF](https://computingforgeeks.com/self-host-stirling-pdf-docker/),
  [ai-pdf-autofiller](https://awesome.ecosyste.ms/projects/github.com%2Flindseystead%2Fai-pdf-autofiller)
  (rules first, AI only for leftover fields),
  [doc-translator](https://github.com/JiGuangYa/doc-translator),
  [Scriberr](https://github.com/yb235/Scriberr).

## Status

Planning. The roadmap is the issue tracker.
