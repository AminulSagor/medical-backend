export enum NewsletterChannelType {
  GENERAL = 'GENERAL',
  COURSE_ANNOUNCEMENT = 'COURSE_ANNOUNCEMENT',
}

export enum NewsletterContentType {
  ARTICLE_LINK = 'ARTICLE_LINK',
  CUSTOM_MESSAGE = 'CUSTOM_MESSAGE',
}

export enum NewsletterBroadcastStatus {
  DRAFT = 'DRAFT',
  REVIEW_PENDING = 'REVIEW_PENDING',
  READY = 'READY',
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum NewsletterFrequencyType {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum NewsletterAudienceMode {
  ALL_SUBSCRIBERS = 'ALL_SUBSCRIBERS',
  SEGMENTS = 'SEGMENTS',
  MIXED = 'MIXED',
}

export enum NewsletterSubscriberStatus {
  ACTIVE = 'ACTIVE',
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  BOUNCED = 'BOUNCED',
  SUPPRESSED = 'SUPPRESSED',
}

export enum NewsletterUnsubscribeRequestStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
}

export enum NewsletterArticleSourceType {
  BLOG_POST = 'BLOG_POST',
}

export enum WeekDay {
  SUNDAY = 'SUNDAY',
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
}

export enum NewsletterDeliveryJobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

export enum NewsletterDeliveryRecipientStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  BOUNCED = 'BOUNCED',
  DROPPED = 'DROPPED',
  FAILED = 'FAILED',
}

export enum NewsletterTransmissionEventType {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  BOUNCED = 'BOUNCED',
  DROPPED = 'DROPPED',
  FAILED = 'FAILED',
  UNSUBSCRIBED = 'UNSUBSCRIBED',
}
