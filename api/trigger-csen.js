export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const githubToken = process.env.GITHUB_PAT_TOKEN;
    if (!githubToken) {
        return res.status(500).json({ error: 'GitHub Token not configured' });
    }

    try {
        const response = await fetch('https://api.github.com/repos/Nex-777/ADR_SITO/actions/workflows/csen.yml/dispatches', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ref: 'main'
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('GitHub API Error:', errorData);
            return res.status(response.status).json({ error: 'Failed to trigger workflow', details: errorData });
        }

        return res.status(200).json({ success: true, message: 'Workflow triggered successfully' });
    } catch (err) {
        console.error('Error triggering workflow:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
