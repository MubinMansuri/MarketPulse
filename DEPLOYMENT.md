# Vercel deployment

This Next.js application is ready for Vercel's default Node.js runtime. It must not be deployed to GitHub Pages because the translation API routes require a server runtime.

## One-time setup

1. Create a new Vercel project and import the GitHub repository. Keep the detected Next.js framework and the default build settings.
2. In Vercel, add the production environment variables required by the translation provider. Do not put provider keys in GitHub secrets or commit them to this repository.
3. Set the production domain in Vercel, then complete the production header and WAF checks documented in [SECURITY.md](SECURITY.md).
4. In the GitHub repository, create `preview` and `production` environments. Protect `production` with the reviewers you require.
5. Add these GitHub Actions secrets to the relevant environments:
   - `VERCEL_TOKEN`: a Vercel token scoped only for deployment.
   - `VERCEL_ORG_ID`: the Vercel team or personal account ID.
   - `VERCEL_PROJECT_ID`: the Vercel project ID.

The project and organization IDs are available after linking a local checkout with `vercel link`, in `.vercel/project.json`. That file is intentionally not committed.

## GitHub Actions deployment

Open **Actions → Deploy to Vercel → Run workflow**, select `preview` or `production`, then run it. The workflow pulls the corresponding Vercel environment configuration, creates a prebuilt output, and deploys exactly that output.

The `Validate` workflow runs on every pull request and push to `main`: linting, tests, TypeScript, production build, and a production-only dependency audit.

## Connect GitHub

After creating the remote repository, connect this local repository:

```powershell
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Vercel can then also create preview deployments automatically for pull requests through its Git integration. Keep GitHub Actions deployment manual unless you intentionally want every merge to deploy production.
