export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { authorization } = req.headers;

        // Verify the admin token from the dashboard
        if (authorization !== `Bearer ${process.env.ADMIN_SECRET_TOKEN}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Trigger GitHub Action via GitHub API
        const githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
        if (!githubToken) {
            return res.status(500).json({ error: 'Missing GitHub Token in environment' });
        }

        const GITHUB_REPO = "Nex-777/ADR_SITO";
        
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/csen_sync.yml/dispatches`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `Bearer ${githubToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Vercel-API'
            },
            body: JSON.stringify({
                ref: 'main'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("GitHub API error:", response.status, errorText);
            return res.status(response.status).json({ error: 'Failed to trigger GitHub Action', details: errorText });
        }

        return res.status(200).json({ success: true, message: 'Sync triggered successfully.' });
    } catch (err) {
        console.error("Trigger sync error:", err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
