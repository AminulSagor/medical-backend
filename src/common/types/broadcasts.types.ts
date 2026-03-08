import {
  NewsletterArticleSourceType,
  NewsletterAudienceMode,
  NewsletterBroadcastStatus,
  NewsletterContentType,
  NewsletterFrequencyType,
} from 'src/common/enums/newsletter-constants.enum';

export type BroadcastActionsAllowed = {
  edit: boolean;
  schedule: boolean;
  cancel: boolean;
};

export type BroadcastDetail = {
  id: string;

  subjectLine: string;
  preheaderText: string | null;
  internalName: string | null;

  contentType: NewsletterContentType;
  status: NewsletterBroadcastStatus;

  frequencyType: NewsletterFrequencyType | null;
  scheduledAt: Date | null;
  timezone: string | null;

  cadenceAnchorLabel: string | null;

  estimatedRecipientsCount: number;

  audience: {
    mode: NewsletterAudienceMode;
    segments: Array<{ id: string; name: string }>;
  };

  articleLink: null | {
    sourceType: NewsletterArticleSourceType;
    sourceRefId: string;

    sourceTitleSnapshot: string;
    sourceExcerptSnapshot: string | null;
    sourceAuthorSnapshot: string | null;
    sourceHeroImageUrlSnapshot: string | null;
    ctaLabel: string | null;

    // optional: only if you add the column
    estimatedReadMinutesSnapshot?: number | null;
  };

  customContent: null | {
    messageBodyHtml: string;
    messageBodyText: string | null;

    personalizationTokens: string[];
    serializedEditorState: string | null;
  };

  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }>;

  actionsAllowed: BroadcastActionsAllowed;

  createdAt: Date;
  updatedAt: Date;
};
