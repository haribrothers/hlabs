// The image hlabs's own throwaway containers run (D-190): debian:13-slim, for its shell and util-linux's setpriv.
// restic and the CA bundle come from this computer; nothing else is needed from it. Pinned by digest.
export const HELPER_IMAGE =
  'docker.io/library/debian:13-slim@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0';
