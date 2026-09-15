const resendApiKey = process.env.RESEND_API_KEY;

export async function sendEmail({ to, subject, html, attachments }) {
    if (!resendApiKey) {
        console.error("RESEND_API_KEY non definita. Impossibile inviare l'email.");
        return { success: false, error: 'Servizio di invio email non configurato.' };
    }

    try {
        const payload = {
            from: 'Adrenalina Club <noreply@adrenalinaclub.it>',
            to,
            subject,
            html
        };
        if (attachments && attachments.length > 0) {
            payload.attachments = attachments;
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`
            },
            body: JSON.stringify(payload)
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
