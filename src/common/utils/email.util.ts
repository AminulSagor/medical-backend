export function normalizeEmail(email: string): string {
    return (email || "").trim().toLowerCase();
}

export function generateOtp6(): string {
    // 6-digit numeric OTP (string to preserve leading zeros)
    return Math.floor(100000 + Math.random() * 900000).toString();
}
