import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThanOrEqual } from "typeorm";
import { CronJob } from "cron";
import { BlogPost, PublishingStatus } from "./entities/blog-post.entity";

@Injectable()
export class BlogSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(BlogSchedulerService.name);

    constructor(
        @InjectRepository(BlogPost)
        private readonly postRepo: Repository<BlogPost>,
        private readonly schedulerRegistry: SchedulerRegistry,
    ) {}

    onModuleInit() {
        const cronExpr = process.env.BLOG_SCHEDULER_CRON ?? "* * * * *";

        const job = new CronJob(cronExpr, () => this.publishScheduledPosts());
        this.schedulerRegistry.addCronJob("blog-auto-publish", job);
        job.start();

        this.logger.log(
            `Blog scheduler started — cron: "${cronExpr}"`,
        );
    }

    async publishScheduledPosts() {
        const now = new Date();

        const duePosts = await this.postRepo.find({
            where: {
                publishingStatus: PublishingStatus.SCHEDULED,
                scheduledPublishDate: LessThanOrEqual(now),
            },
        });

        if (!duePosts.length) return;

        for (const post of duePosts) {
            post.publishingStatus = PublishingStatus.PUBLISHED;
            post.publishedAt = now;
        }

        await this.postRepo.save(duePosts);

        this.logger.log(
            `Auto-published ${duePosts.length} scheduled post(s): ${duePosts.map((p) => p.title).join(", ")}`,
        );
    }
}
