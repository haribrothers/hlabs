#!/bin/sh
# After the .deb or .rpm removes hlabs: its sudoers rule goes too. A .deb says "remove" or "purge", an .rpm 0 when
# it's erased (not upgraded).
case "${1:-}" in
  remove | purge | 0) rm -f /etc/sudoers.d/hlabs ;;
esac
exit 0
