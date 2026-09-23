import AddRounded from '@mui/icons-material/AddRounded';
import BackupOutlined from '@mui/icons-material/BackupOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import RocketLaunchOutlined from '@mui/icons-material/RocketLaunchOutlined';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ComponentType } from 'react';
import { HELP, searchHelp, type HelpTopic } from '@shared/help';
import { EmptyState } from '../../components/EmptyState';
import { useHealth } from '../../state/health';
import { useNav } from '../../state/nav';
import { md, SHAPE, STATE } from '../../theme';
import { Page } from '../Placeholder';
import { HelpFooter } from './HelpFooter';

/** The icon each topic is shown with. */
export const TOPIC_ICONS: Record<HelpTopic['icon'], ComponentType<{ sx?: object }>> = {
  start: RocketLaunchOutlined,
  licence: GavelOutlined,
  add: AddRounded,
  download: DownloadOutlined,
  organise: TravelExploreOutlined,
  project: SportsEsportsOutlined,
  safety: ShieldOutlined,
  trouble: BuildOutlined,
};

/** One line about the library, with the way to see to it. */
function Status() {
  const go = useNav((s) => s.go);
  const { review, needCredit, restricted, backup, sinceBackup } = useHealth();
  const lines: { icon: ComponentType<{ sx?: object }>; tone: 'ok' | 'warn' | 'bad'; text: string; to: () => void }[] = [];
  if (review) lines.push({ icon: RateReviewOutlined, tone: 'warn', text: review === 1 ? 'One pack is waiting in Review' : `${review} packs are waiting in Review`, to: () => go({ to: 'inbox' }) });
  if (needCredit || restricted)
    lines.push({
      icon: GavelOutlined,
      tone: restricted ? 'bad' : 'warn',
      text: [needCredit ? `${needCredit} without a credit line` : '', restricted ? `${restricted} with restricted terms` : ''].filter(Boolean).join(' · '),
      to: () => go({ to: 'browse' }),
    });
  if (!backup?.target) lines.push({ icon: WarningAmberRounded, tone: 'warn', text: 'No backups for this library', to: () => go({ to: 'settings', section: 'backups' }) });
  else if (backup.lastError) lines.push({ icon: ErrorOutlineRounded, tone: 'bad', text: 'The last backup didn’t finish', to: () => go({ to: 'settings', section: 'backups' }) });
  else if (sinceBackup !== null && sinceBackup > 7) lines.push({ icon: BackupOutlined, tone: 'warn', text: `Last backed up ${sinceBackup} days ago`, to: () => go({ to: 'settings', section: 'backups' }) });

  if (!lines.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: md('primary'), padding: '4px 2px' }}>
        <CheckCircleRounded sx={{ fontSize: 20 }} />
        <Typography variant="bodyMedium">Your library is in good order: nothing waiting, every licence on record, backups up to date.</Typography>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {lines.map((l) => (
        <ButtonBase
          key={l.text}
          onClick={l.to}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            borderRadius: `${SHAPE.full}px`,
            color: l.tone === 'bad' ? md('onErrorContainer') : md('onTertiaryContainer'),
            backgroundColor: l.tone === 'bad' ? md('errorContainer') : md('tertiaryContainer'),
            '&:hover': { opacity: 1 - STATE.hover },
          }}
        >
          <l.icon sx={{ fontSize: 18 }} />
          <Typography variant="labelLarge">{l.text}</Typography>
          <ChevronRightRounded sx={{ fontSize: 18 }} />
        </ButtonBase>
      ))}
    </div>
  );
}

function TopicCard({ topic }: { topic: HelpTopic }) {
  const go = useNav((s) => s.go);
  const Icon = TOPIC_ICONS[topic.icon];
  return (
    <ButtonBase
      onClick={() => go({ to: 'helpTopic', id: topic.id })}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        p: 2.5,
        textAlign: 'left',
        borderRadius: `${SHAPE.lg}px`,
        backgroundColor: md('surfaceContainerLow'),
        '&:hover': { backgroundColor: md('surfaceContainer') },
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), flexShrink: 0 }}>
        <Icon sx={{ fontSize: 22 }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" component="div" sx={{ color: md('onSurface') }}>
          {topic.title}
        </Typography>
        <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25 }}>
          {topic.summary}
        </Typography>
        <Typography variant="labelSmall" component="div" sx={{ color: md('primary'), mt: 1 }}>
          {topic.questions.length} question{topic.questions.length === 1 ? '' : 's'}
        </Typography>
      </span>
    </ButtonBase>
  );
}

/**
 * The help centre: search, the topics, how this library is doing, and the ways to reach a person.
 * Every topic opens a page of its own; the same footer ends all of them.
 */
export function HelpPage() {
  const go = useNav((s) => s.go);
  const [text, setText] = useState('');
  const found = searchHelp(text);

  return (
    <Page title="Help" subtitle="How Tessera works, and what to do when it doesn’t" >
      <TextField
        fullWidth
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search help: licences, downloads, backups…"
        slotProps={{
          input: {
            sx: { borderRadius: `${SHAPE.full}px`, backgroundColor: md('surfaceContainerLowest') },
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded sx={{ color: md('onSurfaceVariant') }} />
              </InputAdornment>
            ),
          },
        }}
      />

      {text.trim() ? (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {found.length === 0 && (
            <EmptyState
              icon={SearchOffRounded}
              title="Nothing matches"
              body={`No answer here mentions “${text.trim()}”. The topics below cover the whole app, and the footer reaches a person.`}
              actions={
                <Button variant="contained" onClick={() => setText('')}>
                  Show the topics
                </Button>
              }
            />
          )}
          {found.map(({ topic, question }) => (
            <ButtonBase
              key={`${topic.id}-${question.id}`}
              onClick={() => go({ to: 'helpTopic', id: topic.id, question: question.id })}
              sx={{ display: 'block', textAlign: 'left', p: 2, borderRadius: `${SHAPE.md}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}
            >
              <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                {question.q}
              </Typography>
              <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
                {topic.title} · {question.a[0]}
              </Typography>
            </ButtonBase>
          ))}
        </div>
      ) : (
        <>
          <div style={{ margin: '24px 0 8px' }}>
            <Status />
          </div>
          <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface'), mt: 4 }}>
            Topics
          </Typography>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginTop: 12 }}>
            {HELP.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        </>
      )}

      <HelpFooter />
    </Page>
  );
}
