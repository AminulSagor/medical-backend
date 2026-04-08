import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class AudienceResolverService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    // @InjectRepository(NewsletterSubscriberSegmentMembership)
    // private readonly membershipRepo: Repository<NewsletterSubscriberSegmentMembership>,
  ) {}

  // Simply counts all active subscribers in the database
  async estimateAllSubscribers(): Promise<number> {
    return this.subscriberRepo.count({
      where: {
        status: NewsletterSubscriberStatus.ACTIVE,
      },
    });
  }

  // Used by your actual delivery queue worker to get the list of emails to send to
  async resolveAllActiveSubscriberIds(): Promise<string[]> {
    const active = await this.subscriberRepo.find({
      where: {
        status: NewsletterSubscriberStatus.ACTIVE,
      },
      select: ['id'],
    });

    return active.map((s) => s.id);
  }
}
