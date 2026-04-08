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
// import { NewsletterBroadcast } from './newsletter-broadcast.entity';
// @Entity('newsletter_broadcast_segments')
// @Unique('uq_newsletter_broadcast_segments_broadcast_segment', [
//   'broadcastId',
//   'segmentId',
// ])
// export class NewsletterBroadcastSegment {
//   @PrimaryGeneratedColumn('uuid')
//   id: string;

//   @Column({ type: 'uuid' })
//   @Index()
//   broadcastId: string;

//   @Column({ type: 'uuid' })
//   @Index()
//   segmentId: string;

//   @ManyToOne(() => NewsletterBroadcast, (b) => b.broadcastSegments, {
//     onDelete: 'CASCADE',
//   })
//   @JoinColumn({ name: 'broadcastId' })
//   broadcast: NewsletterBroadcast;

//   @ManyToOne(() => NewsletterAudienceSegment, { onDelete: 'RESTRICT' })
//   @JoinColumn({ name: 'segmentId' })
//   segment: NewsletterAudienceSegment;

//   @CreateDateColumn({ type: 'timestamptz' })
//   createdAt: Date;
// }
