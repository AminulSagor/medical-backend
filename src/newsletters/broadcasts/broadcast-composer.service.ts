import { Injectable } from '@nestjs/common';

@Injectable()
export class BroadcastComposerService {
  buildCustomMessagePreviewHtml(input: {
    subjectLine: string;
    preheaderText?: string | null;
    messageBodyHtml: string;
  }): string {
    const preheader = input.preheaderText
      ? `<div style="display:none">${input.preheaderText}</div>`
      : '';
    return `
      <!doctype html>
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          ${preheader}
          <h2>${this.escapeHtml(input.subjectLine)}</h2>
          <div>${input.messageBodyHtml}</div>
        </body>
      </html>
    `;
  }

  buildArticlePreviewHtml(input: {
    subjectLine: string;
    articleTitle: string;
    excerpt?: string | null;
    ctaLabel?: string | null;
    articleUrl?: string | null;
    heroImageUrl?: string | null;
  }): string {
    const hero = input.heroImageUrl
      ? `<img src="${input.heroImageUrl}" alt="" style="max-width:100%;border-radius:8px;" />`
      : '';

    return `
      <!doctype html>
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>${this.escapeHtml(input.subjectLine)}</h2>
          ${hero}
          <h3>${this.escapeHtml(input.articleTitle)}</h3>
          <p>${this.escapeHtml(input.excerpt ?? '')}</p>
          ${
            input.articleUrl
              ? `<a href="${input.articleUrl}" target="_blank" rel="noopener">${this.escapeHtml(
                  input.ctaLabel ?? 'Read Full Article',
                )}</a>`
              : ''
          }
        </body>
      </html>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
