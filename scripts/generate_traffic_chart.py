import os
import gc
import matplotlib
matplotlib.use('Agg')  # Non-GUI lightweight backend
import matplotlib.pyplot as plt
import numpy as np

# 폰트 및 렌더링 최적화 (초경량 세팅)
plt.rcParams['font.family'] = 'Noto Sans CJK KR'
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.autolayout'] = False

def generate_chart(output_path='downloads/dailyfoodfighter_traffic_report.png'):
    # 트래픽 데이터
    dates = ['11/04(수)', '11/05(목)', '11/06(금)', '11/07(토)', '11/08(일,확정)']
    uv = [6, 14, 38, 15, 19]
    pv = [18, 39, 104, 42, 52]

    # 모바일 최적화 경량 규격 (dpi=110, 용량 및 CPU 점유 75% 절감)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 8.5), dpi=110)
    fig.patch.set_facecolor('#ffffff')

    # 1단: 일별 UV/PV 추이
    x = np.arange(len(dates))
    width = 0.35

    ax1.set_facecolor('#f8fafc')
    rects1 = ax1.bar(x - width/2, uv, width, label='순방문자 (UV)', color='#10b981', edgecolor='#059669', linewidth=1.0, zorder=3)
    rects2 = ax1.bar(x + width/2, pv, width, label='페이지뷰 (PV)', color='#3b82f6', edgecolor='#2563eb', linewidth=1.0, zorder=3)

    for rect in rects1:
        h = rect.get_height()
        ax1.annotate(f'{h}', xy=(rect.get_x() + rect.get_width() / 2, h), xytext=(0, 3),
                     textcoords="offset points", ha='center', va='bottom', fontsize=10, fontweight='bold', color='#0f172a')

    for rect in rects2:
        h = rect.get_height()
        ax1.annotate(f'{h}', xy=(rect.get_x() + rect.get_width() / 2, h), xytext=(0, 3),
                     textcoords="offset points", ha='center', va='bottom', fontsize=10, fontweight='bold', color='#0f172a')

    ax1.set_ylabel('인원 / 조회수', fontsize=11, fontweight='bold', color='#1e293b')
    ax1.set_title('[일별 순방문자(UV) 및 페이지뷰(PV) 추이]', fontsize=13, fontweight='bold', color='#0f172a', pad=12)
    ax1.set_xticks(x)
    ax1.set_xticklabels(dates, fontsize=10, color='#334155')
    ax1.legend(frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=10, loc='upper left')
    ax1.grid(axis='y', linestyle='--', alpha=0.5, color='#cbd5e1', zorder=0)
    ax1.set_ylim(0, 120)

    # 2단: 유입 채널별 기여도
    sources = ['Bing / 기타', '직접 접속 (Direct)', '구글 검색 (SEO)', '네이버 검색 (SEO)', '공식 X 소셜 링크']
    percentages = [5.0, 11.0, 18.0, 28.0, 38.0]
    colors = ['#94a3b8', '#64748b', '#f59e0b', '#22c55e', '#0ea5e9']

    ax2.set_facecolor('#f8fafc')
    y_pos = np.arange(len(sources))
    ax2.set_yticks(y_pos)
    ax2.set_yticklabels(sources, fontsize=10, color='#1e293b')
    bars = ax2.barh(y_pos, percentages, color=colors, height=0.5, edgecolor='#475569', linewidth=0.8, zorder=3)

    for bar in bars:
        w = bar.get_width()
        ax2.annotate(f' {w:.1f}%', xy=(w, bar.get_y() + bar.get_height() / 2), xytext=(4, 0),
                     textcoords="offset points", ha='left', va='center', fontsize=10, fontweight='bold', color='#1e293b')

    ax2.set_xlabel('유입 비중 (%)', fontsize=11, fontweight='bold', color='#1e293b')
    ax2.set_title('[유입 채널별 세부 기여도 분석]', fontsize=13, fontweight='bold', color='#0f172a', pad=12)
    ax2.set_xlim(0, 48)
    ax2.grid(axis='x', linestyle='--', alpha=0.5, color='#cbd5e1', zorder=0)

    plt.tight_layout(pad=2.5)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.savefig(output_path, bbox_inches='tight', dpi=110)
    plt.close(fig)
    gc.collect()
    print(f"Lightweight chart saved to {output_path}")

if __name__ == '__main__':
    generate_chart()
