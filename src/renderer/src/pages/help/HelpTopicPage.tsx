import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { HELP, topicById } from '@shared/help';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';
import { HelpFooter } from './HelpFooter';
import { TOPIC_ICONS } from './HelpPage';

/**
 * One help topic: its answers read straight down the page, with the questions listed beside them
 * so a long topic can be jumped through. The same footer ends it as every other help page.
 */
export function HelpTopicPage({ id, question }: { id: string; question?: string }) {
  const go = useNav((s) => s.go);
  const goBack = useNav((s) => s.goBack);
  const back = useNav((s) => s.back);
  const topic = topicById(id);
  const [at, setAt] = useState(question ?? topic?.questions[0]?.id ?? '');

  // Opened straight at one question (from search): show it first.
  useEffect(() => {
    if (!question) return;
    setAt(question);
    const t = setTimeout(() => document.getElementById(`q-${question}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
  }, [question]);

  if (!topic) {
    return (
      <Page title="Help" {...(back.length ? { onBack: goBack } : {})}>
        <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant') }}>
          That topic has gone. Help lists them all.
        </Typography>
        <HelpFooter />
      </Page>
    );
  }

  const Icon = TOPIC_ICONS[topic.icon];
  return (
    <Page
      title={topic.title}
      subtitle={topic.summary}
      onBack={() => (back.length ? goBack() : go({ to: 'help' }))}
      aside={
        <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer') }}>
          <Icon sx={{ fontSize: 24 }} />
        </span>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 48, alignItems: 'start' }}>
        <div>
          {topic.questions.map((q) => (
            <section key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: 16, paddingBottom: 28, marginBottom: 28, borderBottom: `1px solid ${md('outlineVariant')}` }}>
              <Typography variant="titleLarge" component="h2" sx={{ color: md('onSurface') }}>
                {q.q}
              </Typography>
              {q.a.map((para) => (
                <Typography key={para.slice(0, 24)} variant="bodyLarge" component="p" sx={{ color: md('onSurfaceVariant'), mt: 1.5, mb: 0, maxWidth: 760 }}>
                  {para}
                </Typography>
              ))}
            </section>
          ))}

          <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface'), mb: 1.5 }}>
            Other topics
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {HELP.filter((t) => t.id !== topic.id).map((t) => (
              <ButtonBase key={t.id} onClick={() => go({ to: 'helpTopic', id: t.id })} sx={{ px: 2, py: 1, borderRadius: `${SHAPE.full}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}>
                <Typography variant="labelLarge" sx={{ color: md('onSurface') }}>
                  {t.title}
                </Typography>
              </ButtonBase>
            ))}
          </div>
        </div>

        <nav aria-label="Questions in this topic" style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant'), px: 1.5, pb: 1 }}>
            Questions
          </Typography>
          {topic.questions.map((q) => (
            <ButtonBase
              key={q.id}
              onClick={() => {
                setAt(q.id);
                document.getElementById(`q-${q.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }}
              sx={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                px: 1.5,
                py: 1,
                borderRadius: `${SHAPE.md}px`,
                color: at === q.id ? md('onSecondaryContainer') : md('onSurfaceVariant'),
                backgroundColor: at === q.id ? md('secondaryContainer') : 'transparent',
                '&:hover': { backgroundColor: at === q.id ? md('secondaryContainer') : md('surfaceContainerHigh') },
              }}
            >
              <Typography variant="bodyMedium">{q.q}</Typography>
            </ButtonBase>
          ))}
        </nav>
      </div>

      <HelpFooter />
    </Page>
  );
}
