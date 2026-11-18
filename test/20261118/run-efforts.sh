#!/usr/bin/env bash
# 같은 질의를 effort 4단(light · middle · high · xhigh)과 effort 생략으로 차례로 실제 호출한다(느리다: xhigh 는 분 단위).
q="근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차를 알려줘"
node test/20261118/mcp-run-log.mjs "$q"
for e in light middle high xhigh; do node test/20261118/mcp-run-log.mjs "$q" "$e"; done
