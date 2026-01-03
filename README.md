<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JH4zOjSH66Gjt_cQjDHO0Y12Ngd3XfNM

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel (static frontend)

This project's renderer (the Vite React app) can be hosted as a static site on Vercel. The repository already includes `vercel.json` and a `build:web` script that produces the `dist` output used by Vercel.

1. Build the frontend locally to verify:

```powershell
npm run build:web
```

2. To preview the built site locally, serve the `dist` folder (example):

```powershell
# using a simple static server
npx serve -s dist -l 5000
# or
npx http-server dist -p 5000
```

3. Connect the repository to Vercel (via the Vercel dashboard):
   - In Vercel, create a new project and import this repository.
   - Vercel will detect a static build; if asked, set the Build Command to `npm run build:web` and the Output Directory to `dist` (the included `vercel.json` already sets this).

4. Environment variables: if you need server-side keys for production (not recommended in a static frontend), configure them in the Vercel project Settings → Environment Variables.

5. After deployment, Vercel will host your app at the assigned domain. For desktop builds (Electron), keep using `electron-builder` locally — Electron main process files are not deployed to Vercel.

If you'd like, I can commit these changes and push to your remote, then prepare the exact Vercel project settings or walk you through connecting the repository.
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JH4zOjSH66Gjt_cQjDHO0Y12Ngd3XfNM

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
