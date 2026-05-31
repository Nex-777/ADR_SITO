const resendApiKey = process.env.RESEND_API_KEY;

export async function sendEmail({ to, subject, html }) {
    if (!resendApiKey) {
        console.warn("RESEND_API_KEY environment variable is not defined. Email dispatch simulated.");
        return { success: true, simulated: true };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`
            },
            body: JSON.stringify({
                from: 'Adrenalina Club <noreply@adrenalinaclub.it>',
                to,
                subject,
                html
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Resend API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return { success: true, id: data.id };
    } catch (error) {
        console.error("Resend sendEmail error:", error);
        return { success: false, error: error.message };
    }
}
