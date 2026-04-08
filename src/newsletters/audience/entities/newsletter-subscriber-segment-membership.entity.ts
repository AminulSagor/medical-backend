// import {
//   Column,
//   CreateDateColumn,
//   Entity,
//   Index,
//   JoinColumn,
//   ManyToOne,
//   PrimaryGeneratedColumn,
//   Unique,
// } from 'typeorm';
// import { NewsletterSubscriber } from './newsletter-subscriber.entity';
// import { NewsletterAudienceSegment } from './newsletter-audience-segment.entity';

// @Entity('newsletter_subscriber_segment_memberships')
// @Unique('uq_newsletter_subscriber_segment_membership_subscriber_segment', [
//   'subscriberId',
//   'segmentId',
// ])
// export class NewsletterSubscriberSegmentMembership {
//   @PrimaryGeneratedColumn('uuid')
//   id: string;

//   @Column({ type: 'uuid' })
//   @Index()
//   subscriberId: string;

//   @Column({ type: 'uuid' })
//   @Index()
//   segmentId: string;

//   @ManyToOne(() => NewsletterSubscriber, { onDelete: 'CASCADE' })
//   @JoinColumn({ name: 'subscriberId' })
//   subscriber: NewsletterSubscriber;

//   @ManyToOne(() => NewsletterAudienceSegment, { onDelete: 'CASCADE' })
//   @JoinColumn({ name: 'segmentId' })
//   segment: NewsletterAudienceSegment;

//   @Column({ type: 'varchar', length: 20, default: 'ADMIN' })
//   assignedBy: string; // ADMIN | SYSTEM | RULE (string for MVP)

//   @CreateDateColumn({ type: 'timestamptz' })
//   createdAt: Date;
// }
