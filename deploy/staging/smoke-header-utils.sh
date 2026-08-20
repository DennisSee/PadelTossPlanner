#!/usr/bin/env bash

strip_http_line_terminator_cr() {
  # Strip exactly the CR belonging to each CRLF header-line terminator.
  # Any CR elsewhere in a header value remains present for the validator to reject.
  sed $'s/\r$//'
}

extract_last_http_status() {
  strip_http_line_terminator_cr |
    awk 'toupper($1) ~ /^HTTP\// { value=$2 } END { print value }'
}

extract_last_http_location() {
  strip_http_line_terminator_cr |
    sed -nE 's/^[Ll][Oo][Cc][Aa][Tt][Ii][Oo][Nn]:[[:space:]]*(.*)$/\1/p' |
    tail -n 1
}
