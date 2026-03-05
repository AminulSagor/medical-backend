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
import { NewsletterBroadcastSegment } from './entities/newsletter-broadcast-segment.entity';

import { NewsletterAudienceSegment } from '../audience/entities/newsletter-audience-segment.entity';
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
  NewsletterAudienceMode,
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterContentType,
} from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audienceResolverService: AudienceResolverService,
    private readonly previewService: BroadcastPreviewService,
    private readonly auditService: NewsletterAuditService,

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
    @InjectRepository(NewsletterBroadcastSegment)
    private readonly broadcastSegmentRepo: Repository<NewsletterBroadcastSegment>,
    @InjectRepository(NewsletterAudienceSegment)
    private readonly segmentRepo: Repository<NewsletterAudienceSegment>,
    @InjectRepository(NewsletterCadenceSetting)
    private readonly cadenceRepo: Repository<NewsletterCadenceSetting>,
  ) {}

  async createDraft(
    adminUserId: string,
    dto: CreateBroadcastDto,
  ): Promise<Record<string, unknown>> {
    this.validateCreatePayload(dto);

    const segments = await this.loadAndValidateGeneralSegments(dto.segmentIds);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const broadcast = manager.create(NewsletterBroadcast, {
          channelType: NewsletterChannelType.GENERAL,
          contentType: dto.contentType,
          internalName: dto.internalName?.trim() || null,
          subjectLine: dto.subjectLine.trim(),
          preheaderText: dto.preheaderText?.trim() || null,
          status: NewsletterBroadcastStatus.DRAFT,
          audienceMode: dto.audienceMode,
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

        if (
          dto.contentType === NewsletterContentType.ARTICLE_LINK &&
          dto.articleLink
        ) {
          // TODO: replace with article-source adapter lookup
          await manager.save(
            NewsletterBroadcastArticleLink,
            manager.create(NewsletterBroadcastArticleLink, {
              broadcastId: savedBroadcast.id,
              sourceType: dto.articleLink.sourceType,
              sourceRefId: dto.articleLink.sourceRefId,
              sourceTitleSnapshot: 'TEMP ARTICLE TITLE SNAPSHOT',
              sourceExcerptSnapshot: null,
              sourceAuthorSnapshot: null,
              sourceHeroImageUrlSnapshot: null,
              sourcePublishedAtSnapshot: null,
              ctaLabel: dto.articleLink.ctaLabel?.trim() || 'Read Full Article',
            }),
          );
        }

        await manager.save(
          NewsletterBroadcastSegment,
          segments.map((seg) =>
            manager.create(NewsletterBroadcastSegment, {
              broadcastId: savedBroadcast.id,
              segmentId: seg.id,
            }),
          ),
        );

        const estimatedRecipientsCount =
          await this.audienceResolverService.estimateRecipientsBySegmentIds(
            segments.map((s) => s.id),
          );

        savedBroadcast.estimatedRecipientsCount = estimatedRecipientsCount;
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
    // TODO: integrate Blogs/Articles module query
    return {
      items: [],
      meta: { page: query.page ?? 1, limit: query.limit ?? 10, total: 0 },
    };
  }

  async getDetail(id: string): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id, channelType: NewsletterChannelType.GENERAL },
      relations: [
        'customContent',
        'articleLink',
        'attachments',
        'broadcastSegments',
      ],
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

    const segmentIds = (broadcast.broadcastSegments ?? []).map(
      (x) => x.segmentId,
    );
    const segments = segmentIds.length
      ? await this.segmentRepo.findBy({ id: In(segmentIds) })
      : [];

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
        mode: broadcast.audienceMode,
        segments: segments.map((s) => ({ id: s.id, name: s.name })),
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
          fileName: a.fileName,
          mimeType: a.mimeType,
          fileSizeBytes: Number(a.fileSizeBytes),
          fileKey: a.fileKey,
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
      relations: ['customContent', 'articleLink'],
    });

    if (!broadcast)
      throw new NotFoundException('General newsletter broadcast not found');

    this.ensureEditable(broadcast);

    if (dto.subjectLine !== undefined) {
      const subject = dto.subjectLine.trim();
      if (!subject)
        throw new BadRequestException('subjectLine cannot be empty');
      broadcast.subjectLine = subject;
    }
    if (dto.preheaderText !== undefined)
      broadcast.preheaderText = dto.preheaderText?.trim() || null;
    if (dto.internalName !== undefined)
      broadcast.internalName = dto.internalName?.trim() || null;
    if (dto.audienceMode !== undefined)
      broadcast.audienceMode = dto.audienceMode;

    try {
      await this.dataSource.transaction(async (manager) => {
        if (dto.segmentIds) {
          const segments = await this.loadAndValidateGeneralSegments(
            dto.segmentIds,
          );
          await manager.delete(NewsletterBroadcastSegment, {
            broadcastId: broadcast.id,
          });
          await manager.save(
            NewsletterBroadcastSegment,
            segments.map((s) =>
              manager.create(NewsletterBroadcastSegment, {
                broadcastId: broadcast.id,
                segmentId: s.id,
              }),
            ),
          );

          broadcast.estimatedRecipientsCount =
            await this.audienceResolverService.estimateRecipientsBySegmentIds(
              segments.map((s) => s.id),
            );
        }

        if (broadcast.contentType === NewsletterContentType.CUSTOM_MESSAGE) {
          if (dto.articleLink) {
            throw new BadRequestException(
              'articleLink is not allowed for CUSTOM_MESSAGE broadcast',
            );
          }

          if (dto.customContent) {
            if (!dto.customContent.messageBodyHtml?.trim()) {
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
              });
            }

            custom.messageBodyHtml = dto.customContent.messageBodyHtml.trim();
            custom.messageBodyText =
              dto.customContent.messageBodyText?.trim() || null;
            await manager.save(NewsletterBroadcastCustomContent, custom);

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

            if (dto.customContent.serializedEditorState !== undefined) {
              const snapshotText =
                dto.customContent.serializedEditorState?.trim() || null;
              let snap = await manager.findOne(
                NewsletterBroadcastCustomEditorSnapshot,
                {
                  where: { broadcastId: broadcast.id },
                },
              );

              if (snapshotText) {
                if (!snap) {
                  snap = manager.create(
                    NewsletterBroadcastCustomEditorSnapshot,
                    {
                      broadcastId: broadcast.id,
                      format: 'LEXICAL_JSON_STRING',
                      schemaVersion: 1,
                      serializedState: snapshotText,
                    },
                  );
                } else {
                  snap.serializedState = snapshotText;
                }
                await manager.save(
                  NewsletterBroadcastCustomEditorSnapshot,
                  snap,
                );
              } else if (snap) {
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
            link.ctaLabel =
              dto.articleLink.ctaLabel?.trim() || 'Read Full Article';

            // TODO: snapshot from article source adapter
            link.sourceTitleSnapshot =
              link.sourceTitleSnapshot || 'TEMP ARTICLE TITLE SNAPSHOT';

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

  async schedule(
    adminUserId: string,
    broadcastId: string,
    dto: ScheduleBroadcastDto,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, channelType: NewsletterChannelType.GENERAL },
      relations: ['customContent', 'articleLink', 'broadcastSegments'],
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
        'Only draft/ready broadcasts can be scheduled',
      );
    }

    if (!broadcast.subjectLine?.trim()) {
      throw new UnprocessableEntityException(
        'subjectLine is required before scheduling',
      );
    }

    if (!broadcast.broadcastSegments?.length) {
      throw new UnprocessableEntityException(
        'At least one audience segment is required before scheduling',
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
    if (!cadence)
      throw new NotFoundException(
        'General newsletter cadence settings not found',
      );

    const collision = await this.broadcastRepo.findOne({
      where: {
        channelType: NewsletterChannelType.GENERAL,
        status: NewsletterBroadcastStatus.SCHEDULED,
        frequencyType: dto.frequencyType,
        scheduledAt,
      },
    });

    if (collision && collision.id !== broadcast.id) {
      throw new ConflictException('Selected cadence slot is already booked');
    }

    const segmentIds = broadcast.broadcastSegments.map((x) => x.segmentId);
    broadcast.estimatedRecipientsCount =
      await this.audienceResolverService.estimateRecipientsBySegmentIds(
        segmentIds,
      );
    if (broadcast.estimatedRecipientsCount < 1) {
      throw new UnprocessableEntityException(
        'No active recipients available for selected audience',
      );
    }

    broadcast.frequencyType = dto.frequencyType;
    broadcast.scheduledAt = scheduledAt;
    broadcast.timezone = dto.timezone.trim();
    broadcast.cadenceAnchorLabel = dto.cadenceAnchorLabel?.trim() || null;
    broadcast.cadenceVersionAtScheduling = cadence.version;
    broadcast.status = NewsletterBroadcastStatus.SCHEDULED;
    broadcast.updatedByAdminId = adminUserId;

    const saved = await this.broadcastRepo.save(broadcast);

    await this.auditService.log({
      entityType: 'BROADCAST',
      entityId: saved.id,
      action: 'SCHEDULE',
      performedByAdminId: adminUserId,
      meta: {
        scheduledAtUtc: saved.scheduledAt?.toISOString(),
        frequencyType: saved.frequencyType,
      },
    });

    return {
      message: 'Broadcast scheduled successfully',
      id: saved.id,
      subjectLine: saved.subjectLine,
      status: saved.status,
      scheduledAtUtc: saved.scheduledAt?.toISOString(),
      estimatedRecipientsCount: saved.estimatedRecipientsCount,
    };
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
    };
  }

  private validateCreatePayload(dto: CreateBroadcastDto): void {
    if (!dto.subjectLine?.trim())
      throw new BadRequestException('subjectLine is required');
    if (!dto.segmentIds?.length)
      throw new BadRequestException('segmentIds is required');

    if (
      dto.audienceMode === NewsletterAudienceMode.ALL_SUBSCRIBERS &&
      dto.segmentIds.length < 1
    ) {
      throw new BadRequestException(
        'ALL_SUBSCRIBERS requires system segment id',
      );
    }

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

  private async loadAndValidateGeneralSegments(
    segmentIds: string[],
  ): Promise<NewsletterAudienceSegment[]> {
    const uniqueIds = [...new Set(segmentIds)];
    const segments = await this.segmentRepo.findBy({ id: In(uniqueIds) });

    if (segments.length !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more audience segments were not found',
      );
    }

    const invalid = segments.find(
      (s) => s.channelType !== NewsletterChannelType.GENERAL || !s.isActive,
    );
    if (invalid) {
      throw new BadRequestException(
        'All selected segments must be active GENERAL newsletter segments',
      );
    }

    return segments;
  }

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
  ): Record<string, boolean> {
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
}
