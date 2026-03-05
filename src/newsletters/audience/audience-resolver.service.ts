import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { NewsletterSubscriberSegmentMembership } from './entities/newsletter-subscriber-segment-membership.entity';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class AudienceResolverService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectRepository(NewsletterSubscriberSegmentMembership)
    private readonly membershipRepo: Repository<NewsletterSubscriberSegmentMembership>,
  ) {}

  async estimateRecipientsBySegmentIds(segmentIds: string[]): Promise<number> {
    if (!segmentIds.length) return 0;

    const memberships = await this.membershipRepo.find({
      where: { segmentId: In([...new Set(segmentIds)]) },
      select: ['subscriberId'],
    });

    const uniqueSubscriberIds = [
      ...new Set(memberships.map((m) => m.subscriberId)),
    ];
    if (!uniqueSubscriberIds.length) return 0;

    return this.subscriberRepo.count({
      where: {
        id: In(uniqueSubscriberIds),
        status: NewsletterSubscriberStatus.ACTIVE,
      },
    });
  }

  async resolveActiveSubscriberIdsBySegmentIds(
    segmentIds: string[],
  ): Promise<string[]> {
    if (!segmentIds.length) return [];

    const memberships = await this.membershipRepo.find({
      where: { segmentId: In([...new Set(segmentIds)]) },
      select: ['subscriberId'],
    });

    const uniqueSubscriberIds = [
      ...new Set(memberships.map((m) => m.subscriberId)),
    ];
    if (!uniqueSubscriberIds.length) return [];

    const active = await this.subscriberRepo.find({
      where: {
        id: In(uniqueSubscriberIds),
        status: NewsletterSubscriberStatus.ACTIVE,
      },
      select: ['id'],
    });

    return active.map((s) => s.id);
  }
}
