import type { Strings } from './en';

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const ru: Strings = {
  common: {
    cancel: 'Отменить',
    delete: 'Удалить',
    rename: 'Переименовать',
    save: 'Сохранить',
    create: 'Создать',
    continue: 'Продолжить',
    notNow: 'Не сейчас',
    untitled: 'Без названия',
    folder: 'Папка',
    pleaseTryAgain: 'Попробуйте ещё раз.',
    pleaseTryAgainLater: 'Попробуйте ещё раз позже.',
  },
  library: {
    backLabel: 'Библиотека',
    foldersSection: 'Папки',
    notesSection: 'Заметки',
    emptyTitle: 'Пока нет заметок',
    emptySubtitle: 'Нажмите кнопку с плюсом, чтобы создать первую заметку или папку.',
    emptyFolderTitle: 'Пустая папка',
    emptyFolderSubtitle: (folderName: string) =>
      `Нажмите кнопку с плюсом, чтобы добавить заметку в ${folderName}.`,
    thisFolder: 'эту папку',
    newNote: 'Новая заметка',
    newFolder: 'Новая папка',
    createTitle: 'Создать',
    newFolderTitle: 'Новая папка',
    folderNamePlaceholder: 'Название папки',
    renameNoteTitle: 'Переименовать заметку',
    renameFolderTitle: 'Переименовать папку',
    noteTitlePlaceholder: 'Название заметки',
    newNoteSheetTitle: 'Новая заметка',
    titlePlaceholder: 'Название',
    moveToFolder: 'Переместить в папку',
    moveToRoot: 'Убрать из папки',
    root: 'Корень',
    folderEmpty: 'Пусто',
    noteCount: (count: number) =>
      `${count} ${ruPlural(count, 'заметка', 'заметки', 'заметок')}`,
    supportA11y: 'Поддержать OpenNotes',
    headerActionA11y: 'Действие в шапке',
    deleteNoteTitle: 'Удалить заметку?',
    deleteNoteMessage: (title: string) => `«${title}» будет удалена навсегда.`,
    deleteFolderTitle: 'Удалить папку?',
    deleteFolderMessage: (name: string) =>
      `«${name}» будет удалена. Её заметки останутся в библиотеке.`,
    deleteFolderLabel: 'Удалить папку',
    deleteKeepNotesLabel: 'Удалить (оставить заметки)',
    deleteFolderAndNotesTitle: 'Удалить папку и заметки?',
    deleteFolderAndNotesMessage: (name: string, noteText: string) =>
      `«${name}» и ${noteText} внутри будут удалены навсегда.`,
    deleteFolderAndNotesLabel: 'Удалить папку и все заметки',
    deleteAllLabel: 'Удалить всё',
    couldNotCreateNote: 'Не удалось создать заметку',
    couldNotDeleteNote: 'Не удалось удалить заметку',
    couldNotDeleteFolder: 'Не удалось удалить папку',
    backgrounds: {
      plain: 'Чистый лист',
      lined: 'В линейку',
      grid: 'В клетку',
      dotted: 'В точку',
      graph: 'Миллиметровка',
      pdf: 'PDF',
    },
  },
  onboarding: {
    progressA11y: 'Прогресс знакомства',
    skip: 'Пропустить',
    skipA11y: 'Пропустить знакомство',
    startWriting: 'Начать писать',
    enableBackup: 'Включить копию в iCloud',
    continueWithoutBackup: 'Продолжить без копии',
    slides: {
      free: {
        title: 'Заметки должны\nбыть свободными.',
        body: 'OpenNotes — именно такой. Пишите от руки, размечайте PDF и храните каждую страницу без подписки.',
        imageLabel: 'Бумага и алюминиевый стилус, рисующий синюю линию',
      },
      privacy: {
        title: 'И должны\nоставаться вашими.',
        body: 'Без аккаунта. Без слежки. Заметки остаются на вашем устройстве, пока вы не решите иначе.',
        imageLabel: 'Заметка, надёжно укрытая в стеклянном архивном футляре',
      },
      mission: {
        title: 'Создано для всех.',
        body: 'OpenNotes бесплатен, приватен и разрабатывается открыто. Это наше обещание.',
        imageLabel: 'Раскрытый блокнот с тремя плетёными закладками у переплёта',
      },
      backup: {
        title: 'В безопасности даже\nпри катастрофах.',
        body: 'Потерянный iPad, сбой, удалённое приложение — с копией в iCloud ваши заметки переживут всё, в вашем собственном iCloud. Ничто никогда не покидает ваш аккаунт Apple.',
        imageLabel: 'Заметка в прозрачном футляре, защищённая от повреждений',
      },
    },
  },
  backup: {
    rowTitle: 'Копия в iCloud',
    statusAutomatic: 'Автоматически — заметки переживут удаление приложения',
    statusUnavailable: 'iCloud недоступен — войдите в iCloud, чтобы защитить заметки',
    statusOff: 'Выключено — заметки существуют только на этом устройстве',
    turnOffTitle: 'Выключить копию в iCloud?',
    turnOffMessage:
      'Заметки будут существовать только на этом устройстве. Удаление приложения удалит их навсегда.',
    turnOffConfirm: 'Выключить',
    keepOn: 'Оставить включённой',
    restoreTitle: 'Восстановить заметки?',
    restoreMessage: (noteText: string, when: string | null) =>
      `Для аккаунта этого устройства найдена копия iCloud: ${noteText}${when ? ` (сохранена ${when})` : ''}.`,
    restoreAction: 'Восстановить',
    restoreCompleteTitle: 'Восстановление завершено',
    restoreCompleteMessage: (count: number) =>
      `Восстановлено файлов: ${count}.`,
    restoreProblemsTitle: 'Восстановление завершено с ошибками',
    restorePartialMessage: (restored: number, failed: number) =>
      `Восстановлено файлов: ${restored}; не удалось прочитать из iCloud: ${failed}. Остальное попробуйте позже.`,
    restoreUnavailableMessage: 'iCloud сейчас недоступен. Попробуйте позже.',
  },
  sheet: {
    title: 'Свободным заметкам нужна небольшая помощь.',
    subtitle: 'Всё здесь необязательно. Ведение заметок от этого не зависит.',
    joinTitle: 'Присоединиться к сообществу',
    joinSubtitle: 'Идеи, новости и общение',
    rateTitle: 'Оценить OpenNotes',
    rateSubtitle: 'Оставить отзыв в App Store',
    githubTitle: 'Поставить звезду на GitHub',
    githubSubtitle: 'Следить за открытым проектом',
    missionTitle: 'Наша миссия',
    missionSubtitle: 'Почему OpenNotes остаётся бесплатным и приватным',
    privacy: 'Конфиденциальность',
    terms: 'Условия',
    support: 'Поддержка',
  },
  community: {
    title: 'Помогите развивать OpenNotes.',
    body: 'Делитесь идеями, голосуйте за будущие функции и знакомьтесь с теми, кто верит, что заметки должны оставаться свободными.',
    join: 'Присоединиться к сообществу',
    couldNotUpdateTitle: 'Не удалось обновить статус сообщества',
    ratingsUnavailableTitle: 'Оценки пока недоступны',
    ratingsUnavailableMessage:
      'Оценка станет доступна, когда OpenNotes установлен из магазина приложений.',
    couldNotOpenRatingsTitle: 'Не удалось открыть оценки',
  },
  time: {
    justNow: 'только что',
    minutesAgo: (m: number) => `${m} мин назад`,
    hoursAgo: (h: number) => `${h} ч назад`,
    yesterday: 'вчера',
    daysAgo: (d: number) => `${d} дн. назад`,
  },
};
