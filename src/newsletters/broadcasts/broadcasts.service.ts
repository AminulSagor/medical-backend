import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';

import { NewsletterBroadcast } from './entities/newsletter-broadcast.entity';
import { NewsletterBroadcastCustomContent } from './entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastCustomContentToken } from './entities/newsletter-broadcast-custom-content-token.entity';
import { NewsletterBroadcastCustomEditorSnapshot } from './entities/newsletter-broadcast-custom-editor-snapshot.entity';
import { NewsletterBroadcastArticleLink } from './entities/newsletter-broadcast-article-link.entity';
import { NewsletterBroadcastAttachment } from './entities/newsletter-broadcast-attachment.entity';

import { NewsletterCadenceSetting } from '../cadence/entities/newsletter-cadence-settings.entity';

import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts-query.dto';
import { ScheduleBroadcastDto } from './dto/schedule-broadcast.dto';
import { CancelBroadcastDto } from './dto/cancel-broadcast.dto';
import { AddBroadcastAttachmentDto } from './dto/add-broadcast-attachment.dto';
import { SearchArticleSourcesQueryDto } from './dto/search-article-sources-query.dto';

import { MutationSuccessResponseDto } from '../../common/dto/mutation-success-response.dto';
import { AudienceResolverService } from '../audience/audience-resolver.service';
import { BroadcastPreviewService } from './broadcast-preview.service';
import { NewsletterAuditService } from '../audit/newsletter-audit.service';
import {
  NewsletterArticleSourceType,
  NewsletterAudienceMode,
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterContentType,
  NewsletterFrequencyType,
} from 'src/common/enums/newsletter-constants.enum';
import { GetWorkspaceMetricsQueryDto } from './dto/get-workspace-metrics-query.dto';
import { ArticleSourceAdapterService } from './article-source-adapter.service';
import { NewsletterBroadcastQueueOrder } from './entities/newsletter-broadcast-queue-order.entity';
import { NewsletterDeliveryRecipient } from '../delivery/entities/newsletter-delivery-recipient.entity';
import { NewsletterDeliveryJob } from '../delivery/entities/newsletter-delivery-job.entity';
import { buildCadenceSlots } from 'src/common/utils/newsletter-cadence-slots.util';
import { ListWorkspaceBroadcastsQueryDto } from './dto/list-workspace-broadcasts-query.dto';
import { ReorderQueueBroadcastsDto } from './dto/reorder-queue-broadcasts.dto';
import { GetCancelPreviewQueryDto } from './dto/get-cancel-preview-query.dto';
import { GetScheduleSuccessQueryDto } from './dto/get-schedule-success-query.dto';
import {
  BlogArticleSourceService,
  BlogPostSnapshot,
} from './blog-article-source.service';
import { DateTime } from 'luxon';
import {
  BroadcastActionsAllowed,
  BroadcastDetail,
} from 'src/common/types/broadcasts.types';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audienceResolverService: AudienceResolverService,
    private readonly previewService: BroadcastPreviewService,
    private readonly auditService: NewsletterAuditService,
    private readonly articleSourceAdapter: ArticleSourceAdapterService,
    private readonly blogArticleSourceService: BlogArticleSourceService,

    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    @InjectRepository(NewsletterBroadcastCustomContent)
    private readonly customContentRepo: Repository<NewsletterBroadcastCustomContent>,
    @InjectRepository(NewsletterBroadcastCustomContentToken)
    private readonly customTokenRepo: Repository<NewsletterBroadcastCustomContentToken>,
    @InjectRepository(NewsletterBroadcastCustomEditorSnapshot)
    private readonly editorSnapshotRepo: Repository<NewsletterBroadcastCustomEditorSnapshot>,
    @InjectRepository(NewsletterBroadcastArticleLink)
    private readonly articleLinkRepo: Repository<NewsletterBroadcastArticleLink>,
    @InjectRepository(NewsletterBroadcastAttachment)
    private readonly attachmentRepo: Repository<NewsletterBroadcastAttachment>,
    // @InjectRepository(NewsletterBroadcastSegment)
    // private readonly broadcastSegmentRepo: Repository<NewsletterBroadcastSegment>,
    // @InjectRepository(NewsletterAudienceSegment)
    // private readonly segmentRepo: Repository<NewsletterAudienceSegment>,
    @InjectRepository(NewsletterCadenceSetting)
    private readonly cadenceRepo: Repository<NewsletterCadenceSetting>,
    @InjectRepository(NewsletterBroadcastQueueOrder)
    private readonly queueOrderRepo: Repository<NewsletterBroadcastQueueOrder>,
    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly deliveryRecipientRepo: Repository<NewsletterDeliveryRecipient>,
    @InjectRepository(NewsletterDeliveryJob)
    private readonly deliveryJobRepo: Repository<NewsletterDeliveryJob>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
  ) {}

  async createDraft(
    adminUserId: string,
    dto: CreateBroadcastDto,
  ): Promise<Record<string, unknown>> {
    this.validateCreatePayload(dto);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const broadcast = manager.create(NewsletterBroadcast, {
          channelType: NewsletterChannelType.GENERAL,
          contentType: dto.contentType,
          internalName: dto.internalName?.trim() || null,
          subjectLine: dto.subjectLine.trim(),
          preheaderText: dto.preheaderText?.trim() || null,
          status: NewsletterBroadcastStatus.DRAFT,
          audienceMode: NewsletterAudienceMode.ALL_SUBSCRIBERS, // <-- Fix here
          estimatedRecipientsCount: 0,
          sentRecipientsCount: 0,
          openedRecipientsCount: 0,
          openRatePercent: '0',
          createdByAdminId: adminUserId,
          updatedByAdminId: adminUserId,
        });

        const savedBroadcast = await manager.save(
          NewsletterBroadcast,
          broadcast,
        );

        if (
          dto.contentType === NewsletterContentType.CUSTOM_MESSAGE &&
          dto.customContent
        ) {
          await manager.save(
            NewsletterBroadcastCustomContent,
            manager.create(NewsletterBroadcastCustomContent, {
              broadcastId: savedBroadcast.id,
              messageBodyHtml: dto.customContent.messageBodyHtml.trim(),
              messageBodyText:
                dto.customContent.messageBodyText?.trim() || null,
            }),
          );

          if (dto.customContent.personalizationTokens?.length) {
            const tokens = [
              ...new Set(
                dto.customContent.personalizationTokens
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ];
            if (tokens.length) {
              await manager.save(
                NewsletterBroadcastCustomContentToken,
                tokens.map((token) =>
                  manager.create(NewsletterBroadcastCustomContentToken, {
                    broadcastId: savedBroadcast.id,
                    token,
                  }),
                ),
              );
            }
          }

          if (dto.customContent.serializedEditorState?.trim()) {
            await manager.save(
              NewsletterBroadcastCustomEditorSnapshot,
              manager.create(NewsletterBroadcastCustomEditorSnapshot, {
                broadcastId: savedBroadcast.id,
                serializedState: dto.customContent.serializedEditorState.trim(),
                format: 'LEXICAL_JSON_STRING',
                schemaVersion: 1,
              }),
            );
          }
        }

        let blogSnapshot: BlogPostSnapshot | null = null;

        if (
          dto.contentType === NewsletterContentType.ARTICLE_LINK &&
          dto.articleLink
        ) {
          if (
            dto.articleLink.sourceType !== NewsletterArticleSourceType.BLOG_POST
          ) {
            throw new BadRequestException(
              'Only BLOG_POST article sources are supported',
            );
          }
          blogSnapshot =
            await this.blogArticleSourceService.getPublishedSnapshotOrThrow(
              dto.articleLink.sourceRefId,
            );
        }
        if (
          dto.contentType === NewsletterContentType.ARTICLE_LINK &&
          dto.articleLink
        ) {
          await manager.save(
            NewsletterBroadcastArticleLink,
            manager.create(NewsletterBroadcastArticleLink, {
              broadcastId: savedBroadcast.id,
              sourceType: dto.articleLink.sourceType,
              sourceRefId: dto.articleLink.sourceRefId,

              sourceTitleSnapshot: blogSnapshot!.title,
              sourceExcerptSnapshot: blogSnapshot!.excerpt,
              sourceAuthorSnapshot: blogSnapshot!.authorName,
              sourceHeroImageUrlSnapshot: blogSnapshot!.heroImageUrl,
              sourcePublishedAtSnapshot: blogSnapshot!.publishedAt,

              ctaLabel: dto.articleLink.ctaLabel?.trim() || 'Read Full Article',
            }),
          );
        }

        // Direct count of everyone
        savedBroadcast.estimatedRecipientsCount =
          await this.audienceResolverService.estimateAllSubscribers();
        await manager.save(NewsletterBroadcast, savedBroadcast);

        return savedBroadcast;
      });

      await this.auditService.log({
        entityType: 'BROADCAST',
        entityId: saved.id,
        action: 'CREATE',
        performedByAdminId: adminUserId,
        meta: { channelType: 'GENERAL', status: 'DRAFT' },
      });

      return {
        message: 'General newsletter broadcast draft created successfully',
        id: saved.id,
        subjectLine: saved.subjectLine,
        status: saved.status,
      };
    } catch (error) {
      this.handleDbError(error);
    }
  }

  async deleteDraft(
    userId: string,
    broadcastId: string,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
    });

    if (!broadcast) {
      throw new NotFoundException('Broadcast not found');
    }

    // Only allow deletion if the broadcast is in a draft or pending state
    const allowedStatuses = [
      NewsletterBroadcastStatus.DRAFT,
      NewsletterBroadcastStatus.REVIEW_PENDING,
      NewsletterBroadcastStatus.READY, // Allow deleting ready but unscheduled items
      NewsletterBroadcastStatus.SCHEDULED, // Optional: If you want to allow deleting scheduled items (they will be unscheduled)
    ];

    if (!allowedStatuses.includes(broadcast.status)) {
      throw new BadRequestException(
        `Cannot delete broadcast with status: ${broadcast.status}`,
      );
    }

    // Remove from Queue if it was scheduled/ready
    if (
      broadcast.status === NewsletterBroadcastStatus.SCHEDULED ||
      broadcast.status === NewsletterBroadcastStatus.READY
    ) {
      await this.queueOrderRepo.delete({ broadcastId: broadcast.id });
    }

    // Soft delete or hard delete depending on your business logic.
    // Here we are doing a hard delete.
    await this.broadcastRepo.delete(broadcast.id);

    return {
      message: 'Broadcast deleted successfully',
      deletedId: broadcastId,
    };
  }

  async list(query: ListBroadcastsQueryDto): Promise<Record<string, unknown>> {
    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      .where('b.channelType = :channelType', {
        channelType: NewsletterChannelType.GENERAL,
      });

    if (query.tab === 'queue') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.READY,
          NewsletterBroadcastStatus.SCHEDULED,
        ],
      });
    } else if (query.tab === 'drafts') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.DRAFT,
          NewsletterBroadcastStatus.REVIEW_PENDING,
        ],
      });
    } else if (query.tab === 'history') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.SENT,
          NewsletterBroadcastStatus.CANCELLED,
          NewsletterBroadcastStatus.FAILED,
        ],
      });
    }

    if (query.frequencyType)
      qb.andWhere('b.frequencyType = :frequencyType', {
        frequencyType: query.frequencyType,
      });
    if (query.status)
      qb.andWhere('b.status = :status', { status: query.status });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(b.subjectLine) LIKE :s OR LOWER(COALESCE(b.internalName, '')) LIKE :s)",
        { s },
      );
    }

    const sortBy = query.sortBy ?? 'scheduledAt';
    const sortOrder = query.sortOrder ?? 'ASC';
    qb.orderBy(`b.${sortBy}`, sortOrder);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const [queue, drafts, history] = await Promise.all([
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.READY,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
        },
      }),
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.DRAFT,
            NewsletterBroadcastStatus.REVIEW_PENDING,
          ]),
        },
      }),
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.SENT,
            NewsletterBroadcastStatus.CANCELLED,
            NewsletterBroadcastStatus.FAILED,
          ]),
        },
      }),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        subjectLine: b.subjectLine,
        contentType: b.contentType,
        status: b.status,
        frequencyType: b.frequencyType,
        scheduledAt: b.scheduledAt,
        estimatedRecipientsCount: b.estimatedRecipientsCount,
        openRatePercent: Number(b.openRatePercent || 0),
        createdAt: b.createdAt,
      })),
      meta: { page, limit, total },
      counts: { queue, drafts, history },
    };
  }

  async searchArticleSources(
    query: SearchArticleSourcesQueryDto,
  ): Promise<Record<string, unknown>> {
    // Only BLOG_POST supported for now (matches NewsletterArticleSourceType.BLOG_POST)
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const result = await this.blogArticleSourceService.searchPublished({
      search: query.search,
      page,
      limit,
    });

    return result;
  }

  async getDetail(id: string): Promise<BroadcastDetail> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id, channelType: NewsletterChannelType.GENERAL },
      // Removed 'broadcastSegments' relation
      relations: ['customContent', 'articleLink', 'attachments'],
    });

    if (!broadcast) {
      throw new NotFoundException('General newsletter broadcast not found');
    }

    const tokenRows = await this.customTokenRepo.find({
      where: { broadcastId: broadcast.id },
      order: { createdAt: 'ASC' },
    });

    const editorSnapshot = await this.editorSnapshotRepo.findOne({
      where: { broadcastId: broadcast.id },
    });

    return {
      id: broadcast.id,
      contentType: broadcast.contentType,
      status: broadcast.status,
      subjectLine: broadcast.subjectLine,
      preheaderText: broadcast.preheaderText,
      internalName: broadcast.internalName,
      frequencyType: broadcast.frequencyType,
      scheduledAt: broadcast.scheduledAt,
      timezone: broadcast.timezone,
      cadenceAnchorLabel: broadcast.cadenceAnchorLabel,
      estimatedRecipientsCount: broadcast.estimatedRecipientsCount,
      audience: {
        mode: NewsletterAudienceMode.ALL_SUBSCRIBERS, // <-- Fix here
        segments: [],
      },
      customContent: broadcast.customContent
        ? {
            messageBodyHtml: broadcast.customContent.messageBodyHtml,
            messageBodyText: broadcast.customContent.messageBodyText,
            personalizationTokens: tokenRows.map((t) => t.token),
            serializedEditorState: editorSnapshot?.serializedState ?? null,
          }
        : null,
      articleLink: broadcast.articleLink
        ? {
            sourceType: broadcast.articleLink.sourceType,
            sourceRefId: broadcast.articleLink.sourceRefId,
            sourceTitleSnapshot: broadcast.articleLink.sourceTitleSnapshot,
            sourceExcerptSnapshot: broadcast.articleLink.sourceExcerptSnapshot,
            sourceAuthorSnapshot: broadcast.articleLink.sourceAuthorSnapshot,
            sourceHeroImageUrlSnapshot:
              broadcast.articleLink.sourceHeroImageUrlSnapshot,
            ctaLabel: broadcast.articleLink.ctaLabel,
          }
        : null,
      attachments: (broadcast.attachments ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((a) => ({
          id: a.id,
          filename: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: Number(a.fileSizeBytes),
          storageKey: a.fileKey,
        })),
      actionsAllowed: this.getActionsAllowed(broadcast),
      createdAt: broadcast.createdAt,
      updatedAt: broadcast.updatedAt,
    };
  }

  async preview(id: string): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id, channelType: NewsletterChannelType.GENERAL },
      relations: ['customContent', 'articleLink'],
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');

    return this.previewService.buildPreviewPayload(
      broadcast,
      broadcast.customContent
        ? {
            messageBodyHtml: broadcast.customContent.messageBodyHtml,
            messageBodyText: broadcast.customContent.messageBodyText,
          }
        : null,
      broadcast.articleLink
        ? {
            sourceTitleSnapshot: broadcast.articleLink.sourceTitleSnapshot,
            sourceExcerptSnapshot: broadcast.articleLink.sourceExcerptSnapshot,
            sourceHeroImageUrlSnapshot:
              broadcast.articleLink.sourceHeroImageUrlSnapshot,
            ctaLabel: broadcast.articleLink.ctaLabel,
          }
        : null,
    );
  }

  async update(
    adminUserId: string,
    id: string,
    dto: UpdateBroadcastDto,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id, channelType: NewsletterChannelType.GENERAL },
      relations: ['customContent', 'articleLink'], // Removed broadcastSegments
    });

    if (!broadcast) {
      throw new NotFoundException('General newsletter broadcast not found');
    }

    this.ensureEditable(broadcast);

    // ---- basic fields ----
    if (dto.subjectLine !== undefined) {
      const subject = dto.subjectLine.trim();
      if (!subject)
        throw new BadRequestException('subjectLine cannot be empty');
      broadcast.subjectLine = subject;
    }

    if (dto.preheaderText !== undefined) {
      broadcast.preheaderText = dto.preheaderText?.trim() || null;
    }

    if (dto.internalName !== undefined) {
      broadcast.internalName = dto.internalName?.trim() || null;
    }

    // Force ALL_SUBSCRIBERS regardless of what was passed
    broadcast.audienceMode = NewsletterAudienceMode.ALL_SUBSCRIBERS; // <-- Fix here

    try {
      await this.dataSource.transaction(async (manager) => {
        // ---- content type specific ----
        if (broadcast.contentType === NewsletterContentType.CUSTOM_MESSAGE) {
          if (dto.articleLink) {
            throw new BadRequestException(
              'articleLink is not allowed for CUSTOM_MESSAGE broadcast',
            );
          }

          if (dto.customContent) {
            const html = dto.customContent.messageBodyHtml?.trim();
            if (!html) {
              throw new BadRequestException(
                'customContent.messageBodyHtml cannot be empty',
              );
            }

            let custom = await manager.findOne(
              NewsletterBroadcastCustomContent,
              {
                where: { broadcastId: broadcast.id },
              },
            );

            if (!custom) {
              custom = manager.create(NewsletterBroadcastCustomContent, {
                broadcastId: broadcast.id,
                messageBodyHtml: html,
                messageBodyText:
                  dto.customContent.messageBodyText?.trim() || null,
              });
            } else {
              custom.messageBodyHtml = html;
              custom.messageBodyText =
                dto.customContent.messageBodyText?.trim() || null;
            }

            await manager.save(NewsletterBroadcastCustomContent, custom);

            // tokens: replace all
            await manager.delete(NewsletterBroadcastCustomContentToken, {
              broadcastId: broadcast.id,
            });

            const tokens = [
              ...new Set(
                (dto.customContent.personalizationTokens ?? [])
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ];

            if (tokens.length) {
              await manager.save(
                NewsletterBroadcastCustomContentToken,
                tokens.map((token) =>
                  manager.create(NewsletterBroadcastCustomContentToken, {
                    broadcastId: broadcast.id,
                    token,
                  }),
                ),
              );
            }

            // editor snapshot: optional update
            if (dto.customContent.serializedEditorState !== undefined) {
              const snapshotText =
                dto.customContent.serializedEditorState?.trim() || null;

              const existing = await manager.findOne(
                NewsletterBroadcastCustomEditorSnapshot,
                { where: { broadcastId: broadcast.id } },
              );

              if (snapshotText) {
                if (!existing) {
                  await manager.save(
                    NewsletterBroadcastCustomEditorSnapshot,
                    manager.create(NewsletterBroadcastCustomEditorSnapshot, {
                      broadcastId: broadcast.id,
                      serializedState: snapshotText,
                      format: 'LEXICAL_JSON_STRING',
                      schemaVersion: 1,
                    }),
                  );
                } else {
                  existing.serializedState = snapshotText;
                  await manager.save(
                    NewsletterBroadcastCustomEditorSnapshot,
                    existing,
                  );
                }
              } else if (existing) {
                await manager.delete(NewsletterBroadcastCustomEditorSnapshot, {
                  broadcastId: broadcast.id,
                });
              }
            }
          }
        }

        if (broadcast.contentType === NewsletterContentType.ARTICLE_LINK) {
          if (dto.customContent) {
            throw new BadRequestException(
              'customContent is not allowed for ARTICLE_LINK broadcast',
            );
          }

          if (dto.articleLink) {
            if (
              dto.articleLink.sourceType !==
              NewsletterArticleSourceType.BLOG_POST
            ) {
              throw new BadRequestException(
                'Only BLOG_POST article sources are supported',
              );
            }

            const snap =
              await this.blogArticleSourceService.getPublishedSnapshotOrThrow(
                dto.articleLink.sourceRefId,
              );

            let link = await manager.findOne(NewsletterBroadcastArticleLink, {
              where: { broadcastId: broadcast.id },
            });

            if (!link) {
              link = manager.create(NewsletterBroadcastArticleLink, {
                broadcastId: broadcast.id,
              } as any);
            }

            link.sourceType = dto.articleLink.sourceType;
            link.sourceRefId = dto.articleLink.sourceRefId;

            link.sourceTitleSnapshot = snap.title;
            link.sourceExcerptSnapshot = snap.excerpt;
            link.sourceAuthorSnapshot = snap.authorName;
            link.sourceHeroImageUrlSnapshot = snap.heroImageUrl;
            link.sourcePublishedAtSnapshot = snap.publishedAt;

            link.ctaLabel =
              dto.articleLink.ctaLabel?.trim() || 'Read Full Article';

            await manager.save(NewsletterBroadcastArticleLink, link);
          }
        }

        broadcast.updatedByAdminId = adminUserId;
        await manager.save(NewsletterBroadcast, broadcast);
      });

      await this.auditService.log({
        entityType: 'BROADCAST',
        entityId: broadcast.id,
        action: 'UPDATE',
        performedByAdminId: adminUserId,
      });

      return {
        message: 'General newsletter broadcast updated successfully',
        id: broadcast.id,
        subjectLine: broadcast.subjectLine,
        status: broadcast.status,
      };
    } catch (error) {
      this.handleDbError(error);
    }
  }

  async addAttachment(
    adminUserId: string,
    broadcastId: string,
    dto: AddBroadcastAttachmentDto,
  ): Promise<MutationSuccessResponseDto> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');
    if (broadcast.contentType !== NewsletterContentType.CUSTOM_MESSAGE) {
      throw new BadRequestException(
        'Attachments are only allowed for CUSTOM_MESSAGE broadcasts',
      );
    }

    this.ensureEditable(broadcast);

    const duplicate = await this.attachmentRepo.findOne({
      where: { broadcastId, fileKey: dto.fileKey.trim() },
    });
    if (duplicate)
      throw new ConflictException(
        'Attachment already linked to this broadcast',
      );

    const saved = await this.attachmentRepo.save(
      this.attachmentRepo.create({
        broadcastId,
        fileKey: dto.fileKey.trim(),
        fileName: dto.fileName.trim(),
        mimeType: dto.mimeType.trim(),
        fileSizeBytes: String(dto.fileSizeBytes),
        sortOrder: dto.sortOrder ?? 0,
        uploadedByAdminId: adminUserId,
      }),
    );

    return {
      message: 'Attachment added successfully',
      id: saved.id,
      identifier: saved.fileName,
    };
  }

  async removeAttachment(
    _adminUserId: string,
    broadcastId: string,
    attachmentId: string,
  ): Promise<MutationSuccessResponseDto> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');
    this.ensureEditable(broadcast);

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, broadcastId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.attachmentRepo.delete({ id: attachmentId });

    return {
      message: 'Attachment removed successfully',
      id: attachment.id,
      identifier: attachment.fileName,
    };
  }

  // async schedule(
  //   adminUserId: string,
  //   broadcastId: string,
  //   dto: ScheduleBroadcastDto,
  // ): Promise<Record<string, unknown>> {
  //   const broadcast = await this.broadcastRepo.findOne({
  //     where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
  //     relations: ['customContent', 'articleLink', 'broadcastSegments'],
  //   });

  //   if (!broadcast)
  //     throw new NotFoundException('General newsletter broadcast not found');

  //   if (
  //     ![
  //       NewsletterBroadcastStatus.DRAFT,
  //       NewsletterBroadcastStatus.READY,
  //       NewsletterBroadcastStatus.REVIEW_PENDING,
  //     ].includes(broadcast.status)
  //   ) {
  //     throw new UnprocessableEntityException(
  //       'Only draft/ready broadcasts can be scheduled',
  //     );
  //   }

  //   if (!broadcast.subjectLine?.trim()) {
  //     throw new UnprocessableEntityException(
  //       'subjectLine is required before scheduling',
  //     );
  //   }

  //   if (!broadcast.broadcastSegments?.length) {
  //     throw new UnprocessableEntityException(
  //       'At least one audience segment is required before scheduling',
  //     );
  //   }

  //   if (
  //     broadcast.contentType === NewsletterContentType.CUSTOM_MESSAGE &&
  //     !broadcast.customContent?.messageBodyHtml?.trim()
  //   ) {
  //     throw new UnprocessableEntityException(
  //       'Custom message content is required before scheduling',
  //     );
  //   }

  //   if (
  //     broadcast.contentType === NewsletterContentType.ARTICLE_LINK &&
  //     !broadcast.articleLink?.sourceRefId
  //   ) {
  //     throw new UnprocessableEntityException(
  //       'Article source is required before scheduling',
  //     );
  //   }

  //   const scheduledAt = new Date(dto.scheduledAtUtc);
  //   if (Number.isNaN(scheduledAt.getTime()))
  //     throw new BadRequestException('scheduledAtUtc is invalid');
  //   if (scheduledAt <= new Date())
  //     throw new UnprocessableEntityException(
  //       'scheduledAtUtc must be in the future',
  //     );

  //   const cadence = await this.cadenceRepo.findOne({
  //     where: { channelType: NewsletterChannelType.GENERAL },
  //   });
  //   if (!cadence) {
  //     throw new NotFoundException(
  //       'General newsletter cadence settings not found',
  //     );
  //   }

  //   // strict slot validation against cadence windows
  //   const validSlots = buildCadenceSlots({
  //     timezone: dto.timezone.trim(),
  //     frequencyType: dto.frequencyType,
  //     fromDate:
  //       DateTime.fromJSDate(scheduledAt).minus({ days: 2 }).toISODate() ??
  //       undefined,
  //     toDate:
  //       DateTime.fromJSDate(scheduledAt).plus({ days: 2 }).toISODate() ??
  //       undefined,
  //     count: 20,
  //     weekly: {
  //       enabled: cadence.weeklyEnabled,
  //       releaseDay: cadence.weeklyReleaseDay,
  //       releaseTime: cadence.weeklyReleaseTime,
  //     },
  //     monthly: {
  //       enabled: cadence.monthlyEnabled,
  //       dayOfMonth: cadence.monthlyDayOfMonth,
  //       releaseTime: cadence.monthlyReleaseTime,
  //     },
  //   });

  //   const exactSlotMatch = validSlots.some(
  //     (s) => s.scheduledAtUtc === scheduledAt.toISOString(),
  //   );
  //   if (!exactSlotMatch) {
  //     throw new UnprocessableEntityException(
  //       'scheduledAtUtc must match an available cadence slot for the selected frequency',
  //     );
  //   }

  //   const collision = await this.broadcastRepo.findOne({
  //     where: {
  //       channelType: NewsletterChannelType.GENERAL,
  //       status: NewsletterBroadcastStatus.SCHEDULED,
  //       frequencyType: dto.frequencyType,
  //       scheduledAt,
  //     },
  //   });

  //   if (collision && collision.id !== broadcast.id) {
  //     throw new ConflictException('Selected cadence slot is already booked');
  //   }

  //   const segmentIds = broadcast.broadcastSegments.map((x) => x.segmentId);
  //   broadcast.estimatedRecipientsCount =
  //     await this.audienceResolverService.estimateRecipientsBySegmentIds(
  //       segmentIds,
  //     );
  //   if (broadcast.estimatedRecipientsCount < 1) {
  //     throw new UnprocessableEntityException(
  //       'No active recipients available for selected audience',
  //     );
  //   }

  //   broadcast.frequencyType = dto.frequencyType;
  //   broadcast.scheduledAt = scheduledAt;
  //   broadcast.timezone = dto.timezone.trim();
  //   broadcast.cadenceAnchorLabel = dto.cadenceAnchorLabel?.trim() || null;
  //   broadcast.cadenceVersionAtScheduling = cadence.version;
  //   broadcast.status = NewsletterBroadcastStatus.SCHEDULED;
  //   broadcast.updatedByAdminId = adminUserId;

  //   const saved = await this.broadcastRepo.save(broadcast);

  //   await this.ensureQueueOrderExists(
  //     adminUserId,
  //     saved.id,
  //     saved.frequencyType!,
  //   );

  //   await this.auditService.log({
  //     entityType: 'BROADCAST',
  //     entityId: saved.id,
  //     action: 'SCHEDULE',
  //     performedByAdminId: adminUserId,
  //     meta: {
  //       scheduledAtUtc: saved.scheduledAt?.toISOString() ?? null,
  //       frequencyType: saved.frequencyType ?? null,
  //     },
  //   });

  //   return {
  //     message: 'Broadcast scheduled successfully',
  //     id: saved.id,
  //     subjectLine: saved.subjectLine,
  //     status: saved.status,
  //     scheduledAtUtc: saved.scheduledAt!.toISOString(),
  //     estimatedRecipientsCount: saved.estimatedRecipientsCount,
  //     successModal: {
  //       title: 'Broadcast Scheduled Successfully',
  //       summary: {
  //         title: saved.subjectLine,
  //         recipientsCount: saved.estimatedRecipientsCount,
  //         scheduledAtUtc: saved.scheduledAt!.toISOString(),
  //         scheduledAtDisplay: this.formatDateTimeLabel(
  //           saved.scheduledAt,
  //           saved.timezone,
  //         ),
  //         frequencyLabel: this.getFrequencyLabel(saved.frequencyType),
  //       },
  //       ctaLabel: 'Return to Dashboard',
  //     },
  //   };
  // }

  async setScheduleSettings(
    adminUserId: string,
    broadcastId: string,
    dto: ScheduleBroadcastDto,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');

    if (
      ![
        NewsletterBroadcastStatus.DRAFT,
        NewsletterBroadcastStatus.READY,
        NewsletterBroadcastStatus.REVIEW_PENDING,
      ].includes(broadcast.status)
    ) {
      throw new UnprocessableEntityException(
        'Can only configure schedule for draft/ready broadcasts',
      );
    }

    const scheduledAt = new Date(dto.scheduledAtUtc);
    if (Number.isNaN(scheduledAt.getTime()))
      throw new BadRequestException('scheduledAtUtc is invalid');
    if (scheduledAt <= new Date())
      throw new UnprocessableEntityException(
        'scheduledAtUtc must be in the future',
      );

    const cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });
    if (!cadence) {
      throw new NotFoundException(
        'General newsletter cadence settings not found',
      );
    }

    // Strict slot validation against cadence windows
    const validSlots = buildCadenceSlots({
      timezone: dto.timezone.trim(),
      frequencyType: dto.frequencyType,
      fromDate:
        DateTime.fromJSDate(scheduledAt).minus({ days: 2 }).toISODate() ??
        undefined,
      toDate:
        DateTime.fromJSDate(scheduledAt).plus({ days: 2 }).toISODate() ??
        undefined,
      count: 20,
      weekly: {
        enabled: cadence.weeklyEnabled,
        releaseDay: cadence.weeklyReleaseDay,
        releaseTime: cadence.weeklyReleaseTime,
      },
      monthly: {
        enabled: cadence.monthlyEnabled,
        dayOfMonth: cadence.monthlyDayOfMonth,
        releaseTime: cadence.monthlyReleaseTime,
      },
    });

    const exactSlotMatch = validSlots.some(
      (s) => s.scheduledAtUtc === scheduledAt.toISOString(),
    );
    if (!exactSlotMatch) {
      throw new UnprocessableEntityException(
        'scheduledAtUtc must match an available cadence slot for the selected frequency',
      );
    }

    // Save settings but DO NOT change the status to SCHEDULED
    broadcast.frequencyType = dto.frequencyType;
    broadcast.scheduledAt = scheduledAt;
    broadcast.timezone = dto.timezone.trim();
    broadcast.cadenceAnchorLabel = dto.cadenceAnchorLabel?.trim() || null;
    broadcast.updatedByAdminId = adminUserId;

    await this.broadcastRepo.save(broadcast);

    return {
      message: 'Schedule settings saved successfully',
      scheduledAtUtc: broadcast.scheduledAt.toISOString(),
    };
  }

  async executeSchedule(
    adminUserId: string,
    broadcastId: string,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
      relations: ['customContent', 'articleLink'], // Removed broadcastSegments
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');

    // 1. Verify schedule settings exist
    if (
      !broadcast.scheduledAt ||
      !broadcast.frequencyType ||
      !broadcast.timezone
    ) {
      throw new UnprocessableEntityException(
        'Schedule settings must be configured before execution',
      );
    }

    // 2. Validate readiness
    if (!broadcast.subjectLine?.trim()) {
      throw new UnprocessableEntityException(
        'subjectLine is required before scheduling',
      );
    }

    if (
      broadcast.contentType === NewsletterContentType.CUSTOM_MESSAGE &&
      !broadcast.customContent?.messageBodyHtml?.trim()
    ) {
      throw new UnprocessableEntityException(
        'Custom message content is required before scheduling',
      );
    }

    if (
      broadcast.contentType === NewsletterContentType.ARTICLE_LINK &&
      !broadcast.articleLink?.sourceRefId
    ) {
      throw new UnprocessableEntityException(
        'Article source is required before scheduling',
      );
    }

    const cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    // 3. Check for Cadence Collisions
    const collision = await this.broadcastRepo.findOne({
      where: {
        channelType: NewsletterChannelType.GENERAL,
        status: NewsletterBroadcastStatus.SCHEDULED,
        frequencyType: broadcast.frequencyType,
        scheduledAt: broadcast.scheduledAt,
      },
    });

    if (collision && collision.id !== broadcast.id) {
      throw new ConflictException('Selected cadence slot is already booked');
    }

    // 4. Estimate Recipients (Just grab everyone!)
    broadcast.estimatedRecipientsCount =
      await this.audienceResolverService.estimateAllSubscribers();

    // 5. Finalize the Execution
    broadcast.cadenceVersionAtScheduling = cadence!.version;
    broadcast.status = NewsletterBroadcastStatus.SCHEDULED; // THE TRIGGER
    broadcast.updatedByAdminId = adminUserId;

    const saved = await this.broadcastRepo.save(broadcast);

    await this.ensureQueueOrderExists(
      adminUserId,
      saved.id,
      saved.frequencyType!,
    );

    await this.auditService.log({
      entityType: 'BROADCAST',
      entityId: saved.id,
      action: 'SCHEDULE',
      performedByAdminId: adminUserId,
      meta: {
        scheduledAtUtc: saved.scheduledAt?.toISOString() ?? null,
        frequencyType: saved.frequencyType ?? null,
      },
    });

    return {
      message: 'Broadcast scheduled successfully',
      id: saved.id,
      status: saved.status,
      scheduledAtUtc: saved.scheduledAt!.toISOString(),
      estimatedRecipientsCount: saved.estimatedRecipientsCount,
      successModal: {
        title: 'Broadcast Scheduled Successfully',
        summary: {
          title: saved.subjectLine,
          recipientsCount: saved.estimatedRecipientsCount,
          scheduledAtDisplay: this.formatDateTimeLabel(
            saved.scheduledAt!,
            saved.timezone!,
          ),
        },
        ctaLabel: 'Return to Dashboard',
      },
    };
  }

  private async ensureQueueOrderExists(
    adminUserId: string,
    broadcastId: string,
    frequencyType: string,
  ): Promise<void> {
    const existing = await this.queueOrderRepo.findOne({
      where: { broadcastId },
    });
    if (existing) return;

    const maxRow = await this.queueOrderRepo
      .createQueryBuilder('q')
      .select('MAX(q.sequenceIndex)', 'max')
      .where('q.channelType = :channelType', {
        channelType: NewsletterChannelType.GENERAL,
      })
      .andWhere('q.frequencyType = :frequencyType', { frequencyType })
      .getRawOne<{ max: string | null }>();

    const nextSeq = (maxRow?.max ? Number(maxRow.max) : 0) + 1;

    await this.queueOrderRepo.save(
      this.queueOrderRepo.create({
        broadcastId,
        channelType: NewsletterChannelType.GENERAL,
        frequencyType,
        sequenceIndex: nextSeq,
        updatedByAdminId: adminUserId,
      }),
    );
  }

  private async compactQueueSequences(frequencyType: string): Promise<void> {
    const rows = await this.queueOrderRepo.find({
      where: {
        channelType: NewsletterChannelType.GENERAL,
        frequencyType,
      },
      order: { sequenceIndex: 'ASC', createdAt: 'ASC' },
    });

    let i = 1;
    for (const row of rows) {
      row.sequenceIndex = i++;
    }
    if (rows.length) {
      await this.queueOrderRepo.save(rows);
    }
  }

  async cancel(
    adminUserId: string,
    broadcastId: string,
    dto: CancelBroadcastDto,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');

    if (broadcast.status !== NewsletterBroadcastStatus.SCHEDULED) {
      throw new UnprocessableEntityException(
        'Only scheduled broadcasts can be cancelled',
      );
    }

    if (!broadcast.scheduledAt || broadcast.scheduledAt <= new Date()) {
      throw new UnprocessableEntityException(
        'Only future scheduled broadcasts can be cancelled',
      );
    }

    broadcast.status = NewsletterBroadcastStatus.CANCELLED;
    broadcast.cancelledByAdminId = adminUserId;
    broadcast.cancelledAt = new Date();
    broadcast.cancellationReason = dto.reason?.trim() || null;
    broadcast.updatedByAdminId = adminUserId;

    const saved = await this.broadcastRepo.save(broadcast);

    if (saved.frequencyType) {
      await this.queueOrderRepo.delete({ broadcastId: saved.id });
      await this.compactQueueSequences(saved.frequencyType);
    }

    await this.auditService.log({
      entityType: 'BROADCAST',
      entityId: saved.id,
      action: 'CANCEL',
      performedByAdminId: adminUserId,
      meta: { reason: saved.cancellationReason },
    });

    return {
      message: 'Scheduled broadcast cancelled successfully',
      id: saved.id,
      subjectLine: saved.subjectLine,
      status: saved.status,
      successModal: {
        title: 'Broadcast Cancelled Successfully',
        summary: {
          recipientsCount: saved.estimatedRecipientsCount ?? 0,
          scheduledAtUtc: saved.scheduledAt?.toISOString() ?? null,
          scheduledAtDisplay: this.formatDateTimeLabel(
            saved.scheduledAt,
            saved.timezone,
          ),
          title: saved.subjectLine,
        },
        ctaLabel: 'Return to Queue',
      },
    };
  }

  async getWorkspaceMetrics(
    query: GetWorkspaceMetricsQueryDto,
  ): Promise<Record<string, unknown>> {
    const baseWhere = { channelType: NewsletterChannelType.GENERAL };
    const freqWhere = query.frequencyType
      ? { ...baseWhere, frequencyType: query.frequencyType }
      : baseWhere;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all aggregate queries concurrently for an "allover summary"
    const [
      queuedCount,
      queuedRows,
      sentRecent,
      draftCount,
      byTypeRows,
      historyCount,
      sentCount,
      bestOpenRow,
      totalSubscribers,
      newSubscribersThisWeek,
      historicalAvgRow,
    ] = await Promise.all([
      // 1. Queue Stats
      this.broadcastRepo.count({
        where: {
          ...freqWhere,
          status: In([
            NewsletterBroadcastStatus.READY,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
        },
      }),
      this.broadcastRepo.find({
        where: {
          ...freqWhere,
          status: In([
            NewsletterBroadcastStatus.READY,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
        },
        select: ['scheduledAt'],
        order: { scheduledAt: 'ASC' },
        take: 100,
      }),
      this.broadcastRepo.find({
        where: { ...freqWhere, status: NewsletterBroadcastStatus.SENT },
        select: ['openRatePercent'],
        order: { sentAt: 'DESC' },
        take: 20, // Recent 20 for calculating current engagement
      }),

      // 2. Draft Stats
      this.broadcastRepo.count({
        where: {
          ...baseWhere,
          status: In([
            NewsletterBroadcastStatus.DRAFT,
            NewsletterBroadcastStatus.REVIEW_PENDING,
          ]),
        },
      }),
      this.broadcastRepo
        .createQueryBuilder('b')
        .select('b.contentType', 'contentType')
        .addSelect('COUNT(*)', 'count')
        .where('b.channelType = :channelType', {
          channelType: NewsletterChannelType.GENERAL,
        })
        .andWhere('b.status IN (:...statuses)', {
          statuses: [
            NewsletterBroadcastStatus.DRAFT,
            NewsletterBroadcastStatus.REVIEW_PENDING,
          ],
        })
        .groupBy('b.contentType')
        .getRawMany<{ contentType: string; count: string }>(),

      // 3. History Stats
      this.broadcastRepo.count({
        where: {
          ...freqWhere,
          status: In([
            NewsletterBroadcastStatus.SENT,
            NewsletterBroadcastStatus.CANCELLED,
            NewsletterBroadcastStatus.FAILED,
          ]),
        },
      }),
      this.broadcastRepo.count({
        where: { ...freqWhere, status: NewsletterBroadcastStatus.SENT },
      }),
      this.broadcastRepo
        .createQueryBuilder('b')
        .select(
          "MAX(CAST(COALESCE(NULLIF(b.openRatePercent, ''), '0') AS NUMERIC))",
          'bestOpenRate',
        )
        .where('b.channelType = :channelType', {
          channelType: NewsletterChannelType.GENERAL,
        })
        .andWhere('b.status = :status', {
          status: NewsletterBroadcastStatus.SENT,
        })
        .getRawOne<{ bestOpenRate: string | null }>(),

      // 4. NEW: Subscriber Stats (Assumes subscriberRepo is injected)
      this.subscriberRepo
        .createQueryBuilder('s')
        // Add `.where('s.status = :status', { status: 'active' })` if your entity uses soft deletes/status
        .getCount(),

      this.subscriberRepo
        .createQueryBuilder('s')
        .where('s.createdAt >= :sevenDaysAgo', { sevenDaysAgo })
        .getCount(),

      // 5. NEW: Historical Average Open Rate (For Trend Comparison)
      this.broadcastRepo
        .createQueryBuilder('b')
        .select(
          "AVG(CAST(COALESCE(NULLIF(b.openRatePercent, ''), '0') AS NUMERIC))",
          'avg',
        )
        .where('b.channelType = :channelType', {
          channelType: NewsletterChannelType.GENERAL,
        })
        .andWhere('b.status = :status', {
          status: NewsletterBroadcastStatus.SENT,
        })
        .getRawOne<{ avg: string | null }>(),
    ]);

    // Calculate Averages and Coverage
    const avgOpen = sentRecent.length
      ? Number(
          (
            sentRecent.reduce(
              (sum, x) => sum + Number(x.openRatePercent || 0),
              0,
            ) / sentRecent.length
          ).toFixed(1),
        )
      : 0;

    let coverageDays = 0;
    if (queuedRows.length >= 2) {
      const first = queuedRows[0].scheduledAt;
      const last = queuedRows[queuedRows.length - 1].scheduledAt;
      if (first && last) {
        coverageDays = Math.max(
          0,
          Math.ceil((last.getTime() - first.getTime()) / 86400000),
        );
      }
    } else if (queuedRows.length === 1) {
      coverageDays =
        query.frequencyType === NewsletterFrequencyType.MONTHLY ? 30 : 7;
    }

    // Calculate Engagement Trend (Current vs Historical Avg)
    const historicalAvg = Number(historicalAvgRow?.avg || 0);
    const diff = avgOpen - historicalAvg;
    const trendSign = diff >= 0 ? '+' : '';
    const engagementTrendStr = `${trendSign}${diff.toFixed(1)}% vs historical avg`;

    // Map Exact UI Response
    return {
      message: 'Workspace metrics fetched successfully',
      data: {
        cards: {
          // Card 1: Queue Efficiency
          queueEfficiency: {
            value: `${queuedCount} Items Queued`,
            trend: `Next ${coverageDays} days covered`,
            rawCount: queuedCount,
            draftCount: draftCount,
          },
          // Card 2: Total Subscribers
          totalSubscribers: {
            value: totalSubscribers.toLocaleString(),
            trend: `+${newSubscribersThisWeek} this week`,
          },
          // Card 3: Engagement Pulse
          engagementPulse: {
            value: `${avgOpen.toFixed(1)}% Open`,
            trend: historicalAvg > 0 ? engagementTrendStr : 'Insufficient data',
            bestOpenRatePercent: Number(bestOpenRow?.bestOpenRate ?? 0),
          },
        },
        // Keeping additional data for other charts/breakdowns if needed by frontend
        breakdownByContentType: byTypeRows.map((r) => ({
          contentType: r.contentType,
          count: Number(r.count),
        })),
        historicalPerformance: {
          transmissionCount: historyCount,
          sentCount,
        },
      },
    };
  }

  async listWorkspace(
    query: ListWorkspaceBroadcastsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const tab = query.tab || 'queue';

    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.articleLink', 'al')
      .leftJoinAndSelect('b.attachments', 'att')
      // Removed .leftJoinAndSelect('b.broadcastSegments', 'bs')
      .where('b.channelType = :channelType', {
        channelType: NewsletterChannelType.GENERAL,
      });

    // 1. Filter by Tab (Queue, Drafts, History)
    if (tab === 'queue') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.READY,
          NewsletterBroadcastStatus.SCHEDULED,
        ],
      });
    } else if (tab === 'drafts') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.DRAFT,
          NewsletterBroadcastStatus.REVIEW_PENDING,
        ],
      });
    } else if (tab === 'history') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.SENT,
          NewsletterBroadcastStatus.CANCELLED,
          NewsletterBroadcastStatus.FAILED,
        ],
      });
    }

    // 2. Filter by Broadcast Type (Content Type)
    if (query.contentTypes) {
      qb.andWhere('b.contentType = :contentType', {
        contentType: query.contentTypes,
      });
    }

    if (query.frequencyType) {
      qb.andWhere('b.frequencyType = :frequencyType', {
        frequencyType: query.frequencyType,
      });
    }

    // 3. Search by Title, Author, or Keyword
    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      // COALESCE shouldn't be inside LOWER if the result is a boolean/null, but it's fine for text.
      // Let's use standard TypeORM parameter binding:
      qb.andWhere(
        '(LOWER(b.subjectLine) LIKE :search OR LOWER(b.internalName) LIKE :search OR LOWER(al.sourceTitleSnapshot) LIKE :search OR LOWER(al.sourceAuthorSnapshot) LIKE :search)',
        { search: s }, // Changed parameter name to match binding
      );
    }

    // 4. Sorting
    const sortBy =
      query.sortBy ??
      (tab === 'drafts'
        ? 'lastModified'
        : tab === 'history'
          ? 'sentDate'
          : 'scheduledDate');
    const sortOrder = query.sortOrder ?? (tab === 'history' ? 'DESC' : 'ASC');

    if (sortBy === 'scheduledDate') qb.orderBy('b.scheduledAt', sortOrder);
    else if (sortBy === 'lastModified') qb.orderBy('b.updatedAt', sortOrder);
    else if (sortBy === 'sentDate') qb.orderBy('b.sentAt', sortOrder);
    else if (sortBy === 'openRate') qb.orderBy('b.openRatePercent', sortOrder);
    else qb.orderBy('COALESCE(b.scheduledAt, b.updatedAt)', sortOrder);

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Map rows
    const broadcastIds = items.map((x) => x.id);
    const queueOrders = broadcastIds.length
      ? await this.queueOrderRepo.find({
          where: { broadcastId: In(broadcastIds) },
        })
      : [];
    const queueOrderMap = new Map(
      queueOrders.map((q) => [q.broadcastId, q.sequenceIndex]),
    );

    const rows = items.map((b: any) => {
      const typeLabel =
        b.contentType === NewsletterContentType.ARTICLE_LINK
          ? b.articleLink?.sourceType === 'SPECIAL_REPORT'
            ? 'Special Report'
            : 'Clinical Article'
          : 'Custom Message';

      const articleTitle =
        b.contentType === NewsletterContentType.ARTICLE_LINK
          ? (b.articleLink?.sourceTitleSnapshot ?? b.subjectLine)
          : b.subjectLine;

      const authorName =
        b.contentType === NewsletterContentType.ARTICLE_LINK
          ? (b.articleLink?.sourceAuthorSnapshot ?? null)
          : null;

      const estReadMinutes =
        b.contentType === NewsletterContentType.ARTICLE_LINK
          ? ((b.articleLink as any)?.estimatedReadMinutesSnapshot ?? null)
          : this.estimateReadMinutesFromCustomHtml(
              (b.customContent as any)?.messageBodyHtml ?? '',
            );

      return {
        id: b.id,
        sequence: tab === 'queue' ? (queueOrderMap.get(b.id) ?? null) : null,
        scheduledDate: b.scheduledAt,
        sentDate: b.sentAt,
        lastModified: b.updatedAt,
        frequency: b.frequencyType,
        type: {
          code: b.contentType,
          displayLabel: typeLabel,
          badgeVariant: this.getTypeBadgeVariant(typeLabel),
        },
        articleTitle,
        subjectLine: b.subjectLine,
        author: authorName ? { displayName: authorName } : null,
        target: {
          audienceMode: NewsletterAudienceMode.ALL_SUBSCRIBERS,
          displayLabel: 'All Subscribers',
          segmentCount: 0,
          segments: [],
        },
        estRead: estReadMinutes ? `${estReadMinutes} min` : null,
        estReadMinutes,
        recipients: b.sentRecipientsCount || b.estimatedRecipientsCount || 0,
        engagement: {
          openRatePercent: Number(b.openRatePercent || 0),
          clickRatePercent: Number((b as any).clickRatePercent || 0),
        },
        status: {
          code: b.status,
          displayLabel: this.getStatusLabel(b.status),
        },
        actions: this.getWorkspaceActions(b, tab),
      };
    });

    return {
      tab,
      frequencyType: query.frequencyType ?? null,
      items: rows,
      meta: { page, limit, total },
      viewFlags: {
        activeBroadcastingView: tab === 'queue',
        draftWorkspace: tab === 'drafts',
        archiveManagement: tab === 'history',
      },
    };
  }

  async reorderQueue(
    adminUserId: string,
    dto: ReorderQueueBroadcastsDto,
  ): Promise<Record<string, unknown>> {
    const ids = [...new Set(dto.items.map((x) => x.broadcastId))];
    if (ids.length !== dto.items.length) {
      throw new BadRequestException('broadcastId values must be unique');
    }

    const seqs = dto.items.map((x) => x.sequenceIndex);
    const expected = [...seqs].sort((a, b) => a - b);
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== i + 1) {
        throw new BadRequestException(
          'sequenceIndex must be a continuous sequence starting at 1',
        );
      }
    }

    const broadcasts = await this.broadcastRepo.find({
      where: {
        id: In(ids),
        channelType: NewsletterChannelType.GENERAL,
        status: In([
          NewsletterBroadcastStatus.READY,
          NewsletterBroadcastStatus.SCHEDULED,
        ]),
        frequencyType: dto.frequencyType,
      },
      select: ['id', 'frequencyType'],
    });

    if (broadcasts.length !== ids.length) {
      throw new NotFoundException(
        'One or more queue broadcasts were not found in the selected frequency queue',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.find(NewsletterBroadcastQueueOrder, {
        where: { broadcastId: In(ids) },
      });
      const existingMap = new Map(existing.map((e) => [e.broadcastId, e]));

      const saves = dto.items.map((item) => {
        const row =
          existingMap.get(item.broadcastId) ??
          manager.create(NewsletterBroadcastQueueOrder, {
            broadcastId: item.broadcastId,
            channelType: NewsletterChannelType.GENERAL,
            frequencyType: dto.frequencyType,
          });

        row.sequenceIndex = item.sequenceIndex;
        row.updatedByAdminId = adminUserId;
        return row;
      });

      await manager.save(NewsletterBroadcastQueueOrder, saves);
    });

    await this.auditService.log({
      entityType: 'QUEUE',
      entityId: dto.frequencyType,
      action: 'REORDER',
      performedByAdminId: adminUserId,
      meta: { itemCount: dto.items.length },
    });

    return {
      message: 'Queue order updated successfully',
      id: dto.frequencyType,
      reorderedCount: dto.items.length,
    };
  }

  async getCancelPreview(
    id: string,
    _query: GetCancelPreviewQueryDto,
  ): Promise<Record<string, unknown>> {
    const detail = (await this.getDetail(id)) as BroadcastDetail;

    if (detail.status !== NewsletterBroadcastStatus.SCHEDULED) {
      throw new UnprocessableEntityException(
        'Cancel preview is only available for scheduled broadcasts',
      );
    }

    return {
      modal: {
        title: 'Cancel Scheduled Broadcast?',
        confirmButtonLabel: 'Yes, Cancel Schedule',
        cancelButtonLabel: 'No, Keep Scheduled',
        severity: 'danger',
      },
      payload: {
        broadcastId: detail.id,
        title: detail.articleLink?.sourceTitleSnapshot ?? detail.subjectLine,
        labelType:
          detail.contentType === NewsletterContentType.ARTICLE_LINK
            ? 'Article Broadcast'
            : 'Custom Broadcast',
        recipientsCount: detail.estimatedRecipientsCount ?? 0,
        scheduledAtUtc: detail.scheduledAt
          ? detail.scheduledAt.toISOString()
          : null,
        timezone: detail.timezone,
        scheduledAtDisplay: this.formatDateTimeLabel(
          detail.scheduledAt,
          detail.timezone,
        ),
      },
    };
  }

  async getScheduleSuccessPayload(
    id: string,
    _query: GetScheduleSuccessQueryDto,
  ): Promise<Record<string, unknown>> {
    const detail = (await this.getDetail(id)) as BroadcastDetail;

    if (detail.status !== NewsletterBroadcastStatus.SCHEDULED) {
      throw new UnprocessableEntityException('Broadcast is not scheduled');
    }

    return {
      modal: {
        title: 'Broadcast Scheduled Successfully',
        ctaLabel: 'Return to Dashboard',
        tone: 'success',
      },
      payload: {
        broadcastId: detail.id,
        title: detail.articleLink?.sourceTitleSnapshot ?? detail.subjectLine,
        recipientsCount: detail.estimatedRecipientsCount ?? 0,
        scheduledAtUtc: detail.scheduledAt
          ? detail.scheduledAt.toISOString()
          : null,
        timezone: detail.timezone,
        scheduledAtDisplay: this.formatDateTimeLabel(
          detail.scheduledAt,
          detail.timezone,
        ),
        frequencyLabel: detail.frequencyType
          ? this.getFrequencyLabel(detail.frequencyType)
          : null,
      },
    };
  }

  async getUiViewPayload(id: string): Promise<Record<string, unknown>> {
    const detail = (await this.getDetail(id)) as BroadcastDetail;

    const recipientsCount = await this.resolveFinalOrEstimatedRecipientsCount(
      detail.id,
      detail.estimatedRecipientsCount ?? 0,
    );

    const basePanels = {
      header: {
        id: detail.id,
        title:
          detail.contentType === NewsletterContentType.ARTICLE_LINK
            ? 'View Scheduled Blog Post'
            : 'View Scheduled Broadcast',
        status: detail.status,
        actionsAllowed: detail.actionsAllowed,
      },
      summaryCards: {
        recipients: recipientsCount,
        scheduledForUtc: detail.scheduledAt,
        scheduledForDisplay: this.formatDateTimeLabel(
          detail.scheduledAt,
          detail.timezone,
        ),
        frequency: detail.frequencyType,
        frequencyDisplay: detail.frequencyType
          ? this.getFrequencyLabel(detail.frequencyType)
          : null,
      },
      deliveryLogistics: {
        selectedCadence: detail.frequencyType,
        selectedCadenceLabel:
          detail.cadenceAnchorLabel ??
          this.getFrequencyLabel(detail.frequencyType),
        availableCadenceDateDisplay: detail.scheduledAt
          ? this.formatDateLabel(detail.scheduledAt, detail.timezone)
          : null,
        scheduledTimeDisplay: detail.scheduledAt
          ? this.formatTimeLabel(detail.scheduledAt, detail.timezone)
          : null,
        timezone: detail.timezone,
      },
      audience: {
        mode: detail.audience.mode,
        chips: detail.audience.segments.map((s: any) => s.name),
      },
    };

    if (detail.contentType === NewsletterContentType.ARTICLE_LINK) {
      return {
        ...basePanels,
        viewType: 'ARTICLE_LINK',
        emailPreview: {
          subject: detail.subjectLine,
          fromLabel: 'Texas Airway Institute <education@tai.edu>',
          article: {
            title:
              detail.articleLink?.sourceTitleSnapshot ?? detail.subjectLine,
            excerpt: detail.articleLink?.sourceExcerptSnapshot ?? null,
            heroImageUrl:
              detail.articleLink?.sourceHeroImageUrlSnapshot ?? null,
            ctaLabel: detail.articleLink?.ctaLabel ?? 'Read Full Article',
          },
        },
      };
    }

    return {
      ...basePanels,
      viewType: 'CUSTOM_MESSAGE',
      contentOverview: {
        subjectLine: detail.subjectLine,
        preheaderText: detail.preheaderText,
      },
      messageContent: {
        html: detail.customContent?.messageBodyHtml ?? null,
        text: detail.customContent?.messageBodyText ?? null,
        personalizationTokens:
          detail.customContent?.personalizationTokens ?? [],
      },
      attachments: (detail.attachments ?? []).map((a: any) => ({
        ...a,
        fileTypeLabel: this.getFileTypeLabel(a.mimeType),
        iconKey: this.getAttachmentIconKey(a.mimeType),
        downloadUrl: `/admin/newsletters/general/broadcasts/${detail.id}/attachments/${a.id}/download`, // implement signed URL endpoint later
      })),
    };
  }

  private async resolveFinalOrEstimatedRecipientsCount(
    broadcastId: string,
    estimated: number,
  ): Promise<number> {
    const job = await this.deliveryJobRepo.findOne({
      where: { broadcastId },
      order: { createdAt: 'DESC' } as any,
    });
    if (!job) return estimated;
    return job.totalRecipients || estimated;
  }

  private getWorkspaceActions(b: any, tab: 'queue' | 'drafts' | 'history') {
    if (tab === 'history') {
      return {
        view: true,
        report: b.status === NewsletterBroadcastStatus.SENT,
        duplicate: true,
        edit: false,
        delete: false,
        cancel: false,
      };
    }
    if (tab === 'drafts') {
      return {
        edit: true,
        view: true,
        delete: true,
        schedule: true,
      };
    }
    return {
      edit: this.getActionsAllowed(b).edit,
      view: true,
      cancel: this.getActionsAllowed(b).cancel,
      reorder: true,
    };
  }

  private getTypeBadgeVariant(typeLabel: string): string {
    if (/clinical/i.test(typeLabel)) return 'teal';
    if (/special/i.test(typeLabel)) return 'purple';
    if (/custom/i.test(typeLabel)) return 'gray';
    return 'gray';
  }

  private getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'Draft',
      REVIEW_PENDING: 'Review Pending',
      READY: 'Ready',
      SCHEDULED: 'Scheduled',
      SENT: 'Sent',
      CANCELLED: 'Cancelled',
      FAILED: 'Failed',
    };
    return map[status] ?? status;
  }

  private estimateReadMinutesFromCustomHtml(html: string): number | null {
    if (!html) return null;
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return null;
    return Math.max(1, Math.round(text.split(' ').length / 180));
  }

  private getFrequencyLabel(freq?: string | null): string | null {
    if (!freq) return null;
    if (freq === NewsletterFrequencyType.WEEKLY) return 'Weekly Broadcast';
    if (freq === NewsletterFrequencyType.MONTHLY) return 'Monthly Broadcast';
    return freq;
  }

  private formatDateTimeLabel(
    dateValue?: string | Date | null,
    timezone?: string | null,
  ): string | null {
    if (!dateValue) return null;
    const dt = DateTime.fromJSDate(new Date(dateValue), {
      zone: 'utc',
    }).setZone(timezone || 'UTC');
    return dt.toFormat('LLL dd, yyyy hh:mm a ZZZZ');
  }

  private formatDateLabel(
    dateValue?: string | Date | null,
    timezone?: string | null,
  ): string | null {
    if (!dateValue) return null;
    return DateTime.fromJSDate(new Date(dateValue), { zone: 'utc' })
      .setZone(timezone || 'UTC')
      .toFormat('cccc, LLL dd, yyyy');
  }

  private formatTimeLabel(
    dateValue?: string | Date | null,
    timezone?: string | null,
  ): string | null {
    if (!dateValue) return null;
    return DateTime.fromJSDate(new Date(dateValue), { zone: 'utc' })
      .setZone(timezone || 'UTC')
      .toFormat('hh:mm a ZZZZ');
  }

  private getAttachmentIconKey(mimeType: string): string {
    if (/pdf/i.test(mimeType)) return 'pdf';
    if (/image\//i.test(mimeType)) return 'image';
    if (/word|document/i.test(mimeType)) return 'doc';
    return 'file';
  }

  private getFileTypeLabel(mimeType: string): string {
    if (/pdf/i.test(mimeType)) return 'PDF Document';
    if (/image\/png/i.test(mimeType)) return 'PNG Image';
    if (/image\/jpe?g/i.test(mimeType)) return 'JPEG Image';
    return mimeType;
  }

  private async getWorkspaceFilterOptions(): Promise<Record<string, unknown>> {
    const authors = await this.articleLinkRepo
      .createQueryBuilder('al')
      .select('DISTINCT al.sourceAuthorSnapshot', 'authorName')
      .where('al.sourceAuthorSnapshot IS NOT NULL')
      .orderBy('al.sourceAuthorSnapshot', 'ASC')
      .limit(100)
      .getRawMany<{ authorName: string }>();

    return {
      contentTypes: Object.values(NewsletterContentType),
      authors: authors.map((a) => a.authorName),
      audienceSegments: [], // Cleared out, UI will receive empty array
      quickDateRanges: ['LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM'],
    };
  }

  private validateCreatePayload(dto: CreateBroadcastDto): void {
    if (!dto.subjectLine?.trim())
      throw new BadRequestException('subjectLine is required');

    // // 1. Conditionally require segmentIds ONLY if mode is SEGMENTS
    // if (dto.audienceMode === NewsletterAudienceMode.SEGMENTS) {
    //   if (!dto.segmentIds || dto.segmentIds.length === 0) {
    //     throw new BadRequestException(
    //       'segmentIds is required when audienceMode is SEGMENTS',
    //     );
    //   }
    // }

    if (dto.contentType === NewsletterContentType.CUSTOM_MESSAGE) {
      if (!dto.customContent)
        throw new BadRequestException(
          'customContent is required for CUSTOM_MESSAGE',
        );
      if (dto.articleLink)
        throw new BadRequestException(
          'articleLink is not allowed for CUSTOM_MESSAGE',
        );
      if (!dto.customContent.messageBodyHtml?.trim()) {
        throw new BadRequestException(
          'customContent.messageBodyHtml is required',
        );
      }
    }

    if (dto.contentType === NewsletterContentType.ARTICLE_LINK) {
      if (!dto.articleLink)
        throw new BadRequestException(
          'articleLink is required for ARTICLE_LINK',
        );
      if (dto.customContent)
        throw new BadRequestException(
          'customContent is not allowed for ARTICLE_LINK',
        );
    }
  }

  // private async loadAndValidateGeneralSegments(
  //   segmentIds: string[],
  // ): Promise<NewsletterAudienceSegment[]> {
  //   const uniqueIds = [...new Set(segmentIds)];
  //   const segments = await this.segmentRepo.findBy({ id: In(uniqueIds) });

  //   if (segments.length !== uniqueIds.length) {
  //     throw new NotFoundException(
  //       'One or more audience segments were not found',
  //     );
  //   }

  //   const invalid = segments.find(
  //     (s) => s.channelType !== NewsletterChannelType.GENERAL || !s.isActive,
  //   );
  //   if (invalid) {
  //     throw new BadRequestException(
  //       'All selected segments must be active GENERAL newsletter segments',
  //     );
  //   }

  //   return segments;
  // }

  private ensureEditable(broadcast: NewsletterBroadcast): void {
    const allowed = [
      NewsletterBroadcastStatus.DRAFT,
      NewsletterBroadcastStatus.REVIEW_PENDING,
      NewsletterBroadcastStatus.READY,
      NewsletterBroadcastStatus.SCHEDULED,
    ];

    if (!allowed.includes(broadcast.status)) {
      throw new UnprocessableEntityException(
        `Broadcast cannot be edited in ${broadcast.status} status`,
      );
    }

    if (
      broadcast.status === NewsletterBroadcastStatus.SCHEDULED &&
      broadcast.scheduledAt &&
      broadcast.scheduledAt <= new Date()
    ) {
      throw new UnprocessableEntityException(
        'Broadcast cannot be edited after scheduled time has passed',
      );
    }
  }

  private getActionsAllowed(
    broadcast: NewsletterBroadcast,
  ): BroadcastActionsAllowed {
    const futureScheduled =
      broadcast.status === NewsletterBroadcastStatus.SCHEDULED &&
      !!broadcast.scheduledAt &&
      broadcast.scheduledAt > new Date();

    return {
      edit:
        [
          NewsletterBroadcastStatus.DRAFT,
          NewsletterBroadcastStatus.REVIEW_PENDING,
          NewsletterBroadcastStatus.READY,
        ].includes(broadcast.status) || futureScheduled,

      schedule: [
        NewsletterBroadcastStatus.DRAFT,
        NewsletterBroadcastStatus.REVIEW_PENDING,
        NewsletterBroadcastStatus.READY,
      ].includes(broadcast.status),

      cancel: futureScheduled,
    };
  }

  private handleDbError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const code = (error as any)?.driverError?.code;
      if (code === '23505')
        throw new ConflictException('Unique constraint conflict occurred');
    }
    throw error;
  }

  async getBroadcastReport(id: string): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id, channelType: NewsletterChannelType.GENERAL },
      select: [
        'id',
        'subjectLine',
        'status',
        'sentAt',
        'sentRecipientsCount',
        'openRatePercent',
      ],
    });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    const rows = await this.deliveryRecipientRepo.find({
      where: { broadcastId: id } as any,
      select: [
        'id',
        'deliveryStatus',
        'firstOpenedAt',
        'firstClickedAt',
        'sentAt',
      ],
      take: 5000,
    });

    const total = rows.length || broadcast.sentRecipientsCount || 0;
    const opened = rows.filter((r) => !!r.firstOpenedAt).length;
    const clicked = rows.filter((r) => !!r.firstClickedAt).length;
    const delivered = rows.filter((r) =>
      ['DELIVERED', 'OPENED', 'CLICKED'].includes(String(r.deliveryStatus)),
    ).length;
    const bounced = rows.filter(
      (r) => String(r.deliveryStatus) === 'BOUNCED',
    ).length;
    const failed = rows.filter((r) =>
      ['FAILED', 'DROPPED'].includes(String(r.deliveryStatus)),
    ).length;

    return {
      report: {
        broadcastId: broadcast.id,
        subjectLine: broadcast.subjectLine,
        sentAt: broadcast.sentAt,
        status: broadcast.status,
        recipients: {
          total,
          delivered,
          opened,
          clicked,
          bounced,
          failed,
        },
        rates: {
          openRatePercent: total
            ? Number(((opened / total) * 100).toFixed(1))
            : Number(broadcast.openRatePercent || 0),
          clickRatePercent: total
            ? Number(((clicked / total) * 100).toFixed(1))
            : 0,
          deliveryRatePercent: total
            ? Number(((delivered / total) * 100).toFixed(1))
            : 0,
        },
      },
    };
  }
}
