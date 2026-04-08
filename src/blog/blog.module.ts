import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogController } from './blog.controller';
import { PublicBlogController } from './public-blog.controller';
import { BlogService } from './blog.service';
import { BlogSchedulerService } from './blog-scheduler.service';
import { BlogPost } from './entities/blog-post.entity';
import { BlogPostSeo } from './entities/blog-post-seo.entity';
import { User } from '../users/entities/user.entity';
import { BlogCategory } from '../blog-categories/entities/blog-category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlogDistributionController } from './blog-distribution.controller';
import { BlogDistributionService } from './blog-distribution.service';
import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterSubscriber } from 'src/newsletters/audience/entities/newsletter-subscriber.entity';
import { NewsletterBroadcastArticleLink } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-article-link.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlogPost,
      BlogPostSeo,
      User,
      BlogCategory,
      Tag,
      NewsletterBroadcast,
      NewsletterSubscriber,
      NewsletterBroadcastArticleLink,
    ]),
  ],
  controllers: [
    BlogController,
    PublicBlogController,
    BlogDistributionController,
  ],
  providers: [
    BlogService,
    BlogSchedulerService,
    BlogDistributionService,
    RolesGuard,
  ],
})
export class BlogModule {}
