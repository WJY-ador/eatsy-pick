# 카드 참고 이미지 출처

키 하나에 사진 한 장이다(lib/category-image.ts). 파일 이름이 키다. 메뉴 키, 업종 소분류 키, 넓은 업종 키, 중립 실사 키(neutral-table, neutral-room)가 같은 규칙을 따른다. 확인한 날짜는 모두 2026-11-24다.

## 라이선스
- Unsplash License, https://unsplash.com/license: 상업, 비상업 용도로 무료 사용, 복제, 수정, 배포 가능. 사진가나 Unsplash의 허락과 출처 표기가 필요 없다. 허용되지 않는 것은 상당한 수정 없이 사진을 판매하는 것과 Unsplash 사진을 모아 비슷하거나 경쟁하는 서비스를 만드는 것이다. 사진마다 원본 페이지에서 "Unsplash 라이선스하에서 무료로 사용 가능" 표시를 확인했다(Unsplash+ 사진 아님).
- Pexels License, https://www.pexels.com/ko-kr/license/: 모든 사진을 무료로 사용할 수 있고 출처 표기가 필요 없고 수정할 수 있다. 허용되지 않는 것은 식별 가능한 인물을 부정적으로 보이게 쓰는 것, 수정하지 않은 사본을 판매하는 것, 사진 속 인물이나 브랜드로 제품을 암시적으로 홍보하는 것, 다른 스톡 사진 플랫폼에 재배포하거나 판매하는 것, 상표나 상호의 일부로 쓰는 것이다. Pexels는 사이트 전체에 이 라이선스 하나를 쓴다. 사진마다 원본 페이지에서 "무료 다운로드" 버튼과 작가 이름을 확인했다.

- Wikimedia Commons의 CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/deed.ko : 저작자가 권리를 포기한 사진이다. 상업 용도를 포함해 허락이나 출처 표기 없이 복제, 수정, 배포할 수 있다. Commons API의 라이선스 메타데이터(LicenseShortName)에서 CC0를 확인했다.
- Wikimedia Commons의 퍼블릭 도메인: 저작자가 퍼블릭 도메인으로 공개했거나(asian, neutral-table, 분류 PD-self) 미국 육군 직원이 직무로 찍어 저작권이 없는 사진(pub, 분류 PD US Army)이다. Commons API의 라이선스 메타데이터(License pd, Copyrighted False)와 파일 분류에서 확인했다. 출처 표기 의무는 없지만 아래 표에 작가를 적는다.
- Commons 사진은 CC BY, CC BY-SA처럼 표기나 동일 조건 공개를 요구하는 라이선스를 쓰지 않았다.

## 가공
모든 사진: 1920px 폭으로 받아(neutral-table은 원본이 1600px라 Commons 1280px 축소본) 16:9로 자르고, 640x360과 960x540으로 줄여 webp로 저장했다(cwebp, 메타데이터 없음). Commons 사진은 품질 80, 960 파일이 기존 최대 크기를 넘은 japanese, neutral-room의 960 파일은 품질 74다. 평균 밝기를 맞춘 사진은 감마 값을 적었다(Commons 사진은 출력 = 입력^(1/감마), 평균 밝기를 기존 사진 범위 92~122에 맞췄다). 사진에 얼굴, 간판, 상표가 보이지 않게 잘랐다(jokbal은 왼쪽 위 맥주잔 상표, naengmyeon은 그릇 테두리의 새김 표시를 잘라냈다).

| 파일 | 메뉴 | 원본 페이지 | 작가 | 라이선스 | 자르기(x, y, 너비, 높이) | 밝기 조정 |
|---|---|---|---|---|---|---|
| gamjatang-640.webp, gamjatang-960.webp | 감자탕 | https://www.pexels.com/ko-kr/photo/8896094/ | makafood | Pexels License | 1920x1272 원본에서 0, 96, 1920, 1080 | 감마 1.348 |
| haejangguk-640.webp, haejangguk-960.webp | 해장국 | https://www.pexels.com/ko-kr/photo/8954150/ | makafood | Pexels License | 1920x1272 원본에서 0, 96, 1920, 1080 | 없음 |
| gukbap-640.webp, gukbap-960.webp | 국밥 | https://www.pexels.com/ko-kr/photo/15876419/ | 세훈 예 | Pexels License | 1920x2880 원본에서 0, 1188, 1920, 1080 | 없음 |
| seolleongtang-640.webp, seolleongtang-960.webp | 설렁탕, 곰탕 | https://www.pexels.com/ko-kr/photo/32432715/ | Richard L | Pexels License | 1920x2880 원본에서 0, 1246, 1920, 1080 | 감마 1.017 |
| naengmyeon-640.webp, naengmyeon-960.webp | 냉면 | https://www.pexels.com/ko-kr/photo/37433370/ | Pexels User | Pexels License | 1920x2560 원본에서 389, 1150, 1372, 772 | 감마 1.214 |
| hansik-640.webp, hansik-960.webp | 한정식 | https://www.pexels.com/ko-kr/photo/8999080/ | makafood | Pexels License | 1920x1272 원본에서 0, 96, 1920, 1080 | 감마 1.075 |
| beer-640.webp, beer-960.webp | 맥주 | https://www.pexels.com/ko-kr/photo/18553045/ | thiago japyassu | Pexels License | 1920x3414 원본에서 346, 1275, 1536, 864 | 감마 2.153 |
| chinese-640.webp, chinese-960.webp | 중화요리(짜장면) | https://www.pexels.com/ko-kr/photo/5339076/ | ROMAN ODINTSOV | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 감마 1.148 |
| sushi-640.webp, sushi-960.webp | 초밥, 스시 | https://www.pexels.com/ko-kr/photo/35243523/ | Nadin Sh | Pexels License | 1920x2562 원본에서 0, 741, 1920, 1080 | 없음 |
| donkatsu-640.webp, donkatsu-960.webp | 돈가스 | https://www.pexels.com/ko-kr/photo/5774001/ | Luis Becerra Fotógrafo | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 감마 1.027 |
| gimbap-640.webp, gimbap-960.webp | 김밥 | https://www.pexels.com/ko-kr/photo/31346218/ | Tuğba | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 없음 |
| bakery-640.webp, bakery-960.webp | 베이커리 | https://www.pexels.com/ko-kr/photo/6594575/ | Cats Coming | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 감마 1.601 |
| brunch-640.webp, brunch-960.webp | 브런치 | https://www.pexels.com/ko-kr/photo/35646094/ | Paul De Vota | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 감마 1.56 |
| gopchang-640.webp, gopchang-960.webp | 곱창, 막창 | https://www.pexels.com/ko-kr/photo/12913662/ | FOX ^.ᆽ.^= ∫ | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 없음 |
| dakgalbi-640.webp, dakgalbi-960.webp | 닭갈비 | https://www.pexels.com/ko-kr/photo/33085044/ | Ruby Huang | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 감마 0.872 |
| tteokbokki-640.webp, tteokbokki-960.webp | 떡볶이 | https://www.pexels.com/ko-kr/photo/958550/ | Chan Walrus | Pexels License | 1920x1080 원본에서 0, 0, 1920, 1080 | 없음 |
| jokbal-640.webp, jokbal-960.webp | 족발 | https://www.pexels.com/ko-kr/photo/8866535/ | makafood | Pexels License | 1920x1272 원본에서 466, 377, 1372, 772 | 없음 |
| ramen-640.webp, ramen-960.webp | 라멘 | https://www.pexels.com/ko-kr/photo/16388428/ | Airam Dato-on | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 감마 1.377 |
| samgyeopsal-640.webp, samgyeopsal-960.webp | 삼겹살 | https://www.pexels.com/ko-kr/photo/8954245/ | makafood | Pexels License | 1920x1272 원본에서 0, 96, 1920, 1080 | 감마 1.745 |
| galbi-640.webp, galbi-960.webp | 갈비 | https://www.pexels.com/ko-kr/photo/27643010/ | Nano Erdozain | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 감마 0.399 |
| udon-640.webp, udon-960.webp | 우동 | https://www.pexels.com/ko-kr/photo/9028686/ | makafood | Pexels License | 1920x1272 원본에서 0, 96, 1920, 1080 | 감마 1.026 |
| donburi-640.webp, donburi-960.webp | 텐동, 돈부리 | https://www.pexels.com/ko-kr/photo/31416983/ | zhen ciang huang | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 감마 1.237 |
| guksu-640.webp, guksu-960.webp | 국수 | https://www.pexels.com/ko-kr/photo/5339080/ | ROMAN ODINTSOV | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 감마 1.04 |
| dubu-640.webp, dubu-960.webp | 순두부, 두부 | https://www.pexels.com/ko-kr/photo/8954509/ | makafood | Pexels License | 1920x1272 원본에서 0, 96, 1920, 1080 | 없음 |
| jangeo-640.webp, jangeo-960.webp | 장어 | https://www.pexels.com/ko-kr/photo/19981737/ | Markus Winkler | Pexels License | 1920x1443 원본에서 0, 182, 1920, 1080 | 없음 |
| steak-640.webp, steak-960.webp | 스테이크 | https://www.pexels.com/ko-kr/photo/36682996/ | Mohamed Olwy | Pexels License | 1920x3413 원본에서 0, 1166, 1920, 1080 | 감마 0.623 |
| burger-640.webp, burger-960.webp | 버거 | https://www.pexels.com/ko-kr/photo/12031039/ | Gonzalo Ruiz | Pexels License | 1920x1440 원본에서 0, 180, 1920, 1080 | 감마 0.834 |
| pasta-640.webp, pasta-960.webp | 파스타 | https://www.pexels.com/ko-kr/photo/32632536/ | Nour Alhoda | Pexels License | 1920x3410 원본에서 0, 1165, 1920, 1080 | 없음 |
| sandwich-640.webp, sandwich-960.webp | 샌드위치 | https://www.pexels.com/ko-kr/photo/12540688/ | Vitaly Gorbachev | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 감마 1.943 |
| izakaya-640.webp, izakaya-960.webp | 이자카야 | https://www.pexels.com/ko-kr/photo/31460000/ | Sydney Sang | Pexels License | 1920x1281 원본에서 0, 100, 1920, 1080 | 감마 0.62 |
| bossam-640.webp, bossam-960.webp | 보쌈 | https://www.pexels.com/ko-kr/photo/31649639/ | Theodore Nguyen | Pexels License | 1920x1280 원본에서 0, 100, 1920, 1080 | 없음 |
| pho-640.webp, pho-960.webp | 쌀국수 | https://www.pexels.com/ko-kr/photo/11043968/ | bo MEO | Pexels License | 1920x2560 원본에서 0, 740, 1920, 1080 | 감마 1.716 |
| salad-640.webp, salad-960.webp | 샐러드, 포케 | https://www.pexels.com/ko-kr/photo/17597486/ | Rasul Yarichev | Pexels License | 1920x1440 원본에서 0, 180, 1920, 1080 | 감마 1.254 |
| dessert-640.webp, dessert-960.webp | 케이크, 디저트 | https://www.pexels.com/ko-kr/photo/7966511/ | Felicity Tai | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 없음 |
| taco-640.webp, taco-960.webp | 타코 | https://www.pexels.com/ko-kr/photo/6399999/ | alleksana | Pexels License | 1920x2880 원본에서 0, 900, 1920, 1080 | 감마 0.906 |
| soba-640.webp, soba-960.webp | 소바 | https://www.pexels.com/ko-kr/photo/26727317/ | minami okamoto | Pexels License | 1920x1440 원본에서 0, 180, 1920, 1080 | 없음 |
| yangkkochi-640.webp, yangkkochi-960.webp | 양꼬치 | https://unsplash.com/photos/BxtryGNl9Tk | sooji min (_sooji) | Unsplash License | 1920x1080 원본에서 779, 445, 1130, 635 | 감마 1.01 |
| malatang-640.webp, malatang-960.webp | 마라탕 | https://unsplash.com/photos/6Hz_f41YcwA | Yeh Xintong (blsnki) | Unsplash License | 1920x2880 원본에서 0, 900, 1920, 1080 | 없음 |
| gogi-640.webp, gogi-960.webp | 고기구이 | https://unsplash.com/photos/xk3er6C7oWM | Daniel (unsplashbydan) | Unsplash License | 1920px 폭 원본에서 0, 100, 1920, 1080 | 감마 0.826 |
| hoe-640.webp, hoe-960.webp | 회 | https://unsplash.com/photos/aZqfzi_5lsk | Cloris Ying (clorisyy) | Unsplash License | 1920px 폭 원본에서 0, 740, 1920, 1080 | 없음 |
| coffee-640.webp, coffee-960.webp | 커피 | https://unsplash.com/photos/gOn7dKcCWKg | Nathan Dumlao (nate_dumlao) | Unsplash License | 1920px 폭 원본에서 0, 100, 1920, 1080 | 감마 0.856 |
| chicken-640.webp, chicken-960.webp | 치킨 | https://unsplash.com/photos/nwmZhwOSVnM | Kevin kevin (0x00kevin) | Unsplash License | 1920px 폭 원본에서 0, 100, 1920, 1080 | 없음 |
| jjigae-640.webp, jjigae-960.webp | 찌개 | https://unsplash.com/photos/-v3QPRntwTI | Daniel (unsplashbydan) | Unsplash License | 1920px 폭 원본에서 0, 201, 1920, 1080 (왼쪽 위 술병 라벨을 잘라냄) | 없음 |
| mandu-640.webp, mandu-960.webp | 만두 | https://unsplash.com/photos/3AchE2SDPQI | Bao Menglong (__menglong) | Unsplash License | 1920px 폭 원본에서 0, 160, 1920, 1080 (찜기 옆면의 글자 낙인을 잘라냄) | 없음 |
| pizza-640.webp, pizza-960.webp | 피자 | https://unsplash.com/photos/x00CzBt4Dfk | Aurélien Lemasson-Théobald (aurel__lens) | Unsplash License | 1920px 폭 원본에서 0, 100, 1920, 1080 | 감마 1.085 |
| bar-640.webp, bar-960.webp | 바 | https://unsplash.com/photos/r1xlIoXefXQ | HANVIN CHEONG (hktram0311) | Unsplash License | 1920px 폭 원본에서 0, 1360, 1920, 1080 | 감마 0.894 |
| sundae-640.webp, sundae-960.webp | 순대(순대국 메뉴 키) | https://commons.wikimedia.org/wiki/File:2020-04-09_14.48.18_엄청난떡볶이_순대.jpg | Choi Kwang-mo | CC0 | 1920x1440 받은 사진에서 0, 180, 1920, 1080 | 없음 |
| kalguksu-640.webp, kalguksu-960.webp | 칼국수 | https://commons.wikimedia.org/wiki/File:Bajirak-kalguksu.jpg | Suh Jeong-ho | CC0 | 1920x1280 받은 사진에서 0, 150, 1920, 1080 | 감마 0.89 |
| bunsik-640.webp, bunsik-960.webp | 업종 소분류 분식(어묵꼬치) | https://commons.wikimedia.org/wiki/File:Eomuk-kkochi.jpg | 최광모 (Choe Kwangmo) | CC0 | 1920x1280 받은 사진에서 0, 100, 1920, 1080 | 없음 |
| noodle-640.webp, noodle-960.webp | 업종 소분류 국수/면/만두(비빔 막국수) | https://commons.wikimedia.org/wiki/File:20151003막국수RX10DSC03107.jpg | 최광모 | CC0 | 1920x1280 받은 사진에서 0, 100, 1920, 1080 | 감마 1.3 |
| seafood-640.webp, seafood-960.webp | 업종 소분류 해산물구이/찜(해물찜) | https://commons.wikimedia.org/wiki/File:Haemul-jjim.jpg | 최광모 | CC0 | 1920x1280 받은 사진에서 0, 100, 1920, 1080 | 없음 |
| bingsu-640.webp, bingsu-960.webp | 업종 소분류 아이스크림/요거트/빙수(팥빙수) | https://commons.wikimedia.org/wiki/File:Patbingsu_3.jpg | tookapic | CC0 | 1920x1280 받은 사진에서 0, 40, 1920, 1080 | 감마 0.446 |
| asian-640.webp, asian-960.webp | 업종 소분류 아시안(분짜) | https://commons.wikimedia.org/wiki/File:Bún_chả_Hà_Nội_tại_Aeonmall_Tân_Phú_tháng_4_năm_2018_(1).jpg | Phương Huy | 퍼블릭 도메인 | 1920x1422 받은 사진에서 0, 100, 1920, 1080 | 감마 1.207 |
| korean-640.webp, korean-960.webp | 넓은 업종 한식(반찬) | https://commons.wikimedia.org/wiki/File:Banchan_2.jpg | ijs | CC0 | 1920x1284 받은 사진에서 0, 102, 1920, 1080 | 감마 0.654 |
| japanese-640.webp, japanese-960.webp | 넓은 업종 일식(정식 쟁반) | https://commons.wikimedia.org/wiki/File:Ginger_cow_ribs_teishoku_of_Yoshinoya.jpg | 毒島みるく | CC0 | 1920x1215 받은 사진에서 0, 60, 1920, 1080 (그릇, 쟁반에 상표 없음을 확인) | 없음 |
| pub-640.webp, pub-960.webp | 넓은 업종 주점(빈대떡, 막걸리) | https://commons.wikimedia.org/wiki/File:Korean_mung_bean_pancake_and_rice_wine-Bindaetteok_and_makgeolli.jpg | Pfc. Bo Park, 2ID PAO, US Army | 퍼블릭 도메인(미국 연방정부 저작물) | 1920x1275 받은 사진에서 480, 500, 1378, 775 (위쪽 글자 인쇄 통과 왼쪽 상표 냅킨을 잘라냄) | 없음 |
| neutral-table-640.webp, neutral-table-960.webp | 중립 실사(식당 식탁) | https://commons.wikimedia.org/wiki/File:Table_setting_in_a_restaurant.JPG | Mattes | 퍼블릭 도메인 | 1280x960 받은 사진에서 0, 240, 1280, 720 (창밖 자동차 번호판을 잘라냄) | 없음 |
| neutral-room-640.webp, neutral-room-960.webp | 중립 실사(식당 실내) | https://commons.wikimedia.org/wiki/File:Dining_room_at_the_inn_Dans_les_bras_de_Morphée,_located_on_Île_d'Orléans.jpg | Wilfredor | CC0 | 1920x1280 받은 사진에서 0, 100, 1920, 1080 | 없음 |
