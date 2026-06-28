-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('guest', 'user', 'city_official', 'admin')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── ACCIDENTS ───────────────────────────────────────────────────────────────
CREATE TABLE public.accidents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location      GEOMETRY(Point, 4326) NOT NULL,
  severity      SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 3),
  accident_date DATE,
  road_type     TEXT,
  light_cond    TEXT,
  weather       TEXT,
  vehicles      SMALLINT DEFAULT 1,
  source        TEXT DEFAULT 'historical',
  reported_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accidents_location ON public.accidents USING GIST (location);
CREATE INDEX idx_accidents_severity ON public.accidents (severity);
CREATE INDEX idx_accidents_date     ON public.accidents (accident_date);


-- ─── BIKE_LANES ──────────────────────────────────────────────────────────────
CREATE TABLE public.bike_lanes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom          GEOMETRY(LineString, 4326) NOT NULL,
  lane_type     TEXT,
  surface       TEXT,
  width_m       NUMERIC(4,2),
  name          TEXT,
  osm_id        BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bike_lanes_geom ON public.bike_lanes USING GIST (geom);


-- ─── PROPOSALS ───────────────────────────────────────────────────────────────
CREATE TABLE public.proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom            GEOMETRY(LineString, 4326) NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  proposed_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'under_review', 'approved', 'rejected')),
  safety_score    NUMERIC(5,2),
  ml_version      TEXT,
  ml_features     JSONB,
  upvotes         INT NOT NULL DEFAULT 0,
  downvotes       INT NOT NULL DEFAULT 0,
  comment_count   INT NOT NULL DEFAULT 0,
  length_m        NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_geom        ON public.proposals USING GIST (geom);
CREATE INDEX idx_proposals_proposed_by ON public.proposals (proposed_by);
CREATE INDEX idx_proposals_status      ON public.proposals (status);

CREATE OR REPLACE FUNCTION proposals_set_length()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.length_m   := ST_Length(NEW.geom::GEOGRAPHY);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_proposals_length
  BEFORE INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION proposals_set_length();


-- ─── VOTES ───────────────────────────────────────────────────────────────────
CREATE TABLE public.votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type    SMALLINT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, user_id)
);

CREATE OR REPLACE FUNCTION sync_vote_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.proposals SET
    upvotes   = (SELECT COUNT(*) FROM public.votes
                  WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id) AND vote_type = 1),
    downvotes = (SELECT COUNT(*) FROM public.votes
                  WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id) AND vote_type = -1)
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_vote_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION sync_vote_counts();


-- ─── COMMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE public.comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (LENGTH(body) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_proposal ON public.comments (proposal_id, created_at);

CREATE OR REPLACE FUNCTION sync_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.proposals SET
    comment_count = (SELECT COUNT(*) FROM public.comments
                      WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id))
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_comment_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION sync_comment_count();


-- ─── HAZARD_REPORTS ──────────────────────────────────────────────────────────
CREATE TABLE public.hazard_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location     GEOMETRY(Point, 4326) NOT NULL,
  report_type  TEXT NOT NULL
                 CHECK (report_type IN (
                   'pothole', 'missing_signage', 'blocked_lane',
                   'near_miss', 'poor_lighting', 'other'
                 )),
  description  TEXT,
  reported_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hazard_location ON public.hazard_reports USING GIST (location);


-- ─── ML_MODEL_LOGS ───────────────────────────────────────────────────────────
CREATE TABLE public.ml_model_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT NOT NULL UNIQUE,
  storage_path    TEXT NOT NULL,
  accuracy        NUMERIC(5,4),
  f1_score        NUMERIC(5,4),
  train_samples   INT,
  feature_names   TEXT[],
  trained_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ml_model_active
  ON public.ml_model_logs (is_active)
  WHERE is_active = TRUE;
